module.exports = function(RED) {
    "use strict";

    const { GoogleGenAI } = require('@google/genai');
    const fs = require('fs');
    const path = require('path');
    const https = require('https');
    const http = require('http');
    const { renderTemplate } = require('./template-utils');
    const NodeStatus = require('./status-utils');
    const SafetyUtils = require('./safety-utils');

    // Helper function to fetch data from URL
    async function fetchFromUrl(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https:') ? https : http;
            client.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                    return;
                }
                
                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    resolve(buffer);
                });
            }).on('error', reject);
        });
    }

    // Helper function to read file from filesystem
    async function readFromFile(filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    reject(new Error(`File read error: ${err.message}`));
                } else {
                    resolve(data);
                }
            });
        });
    }

    // Helper function to get MIME type from file extension or URL
    function getMimeType(filePathOrUrl) {
        const ext = path.extname(filePathOrUrl).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
            '.heic': 'image/heic',
            '.heif': 'image/heif'
        };
        return mimeTypes[ext] || 'image/jpeg';
    }

    function GeminiImageGenerateNode(config) {
        RED.nodes.createNode(this, config);
        var node = this;

        // Get the API key config node
        this.apiKeyConfig = RED.nodes.getNode(config.apiKey);

        this.on('input', async function(msg, send, done) {
            // Use send and done for Node-RED 1.0+ compatibility
            send = send || function() { node.send.apply(node, arguments); };
            done = done || function(err) { if (err) node.error(err); };

            // Initialize status tracker
            const status = new NodeStatus(node);

            try {
                // Initialize variables that may be referenced in error handler
                let model = null;

                // Validate API key
                if (!node.apiKeyConfig || !node.apiKeyConfig.credentials || !node.apiKeyConfig.credentials.apikey) {
                    throw new Error('API key not configured. Please configure a Gemini API Key.');
                }

                const apiKey = node.apiKeyConfig.credentials.apikey;

                // Resolve model - use msg.model if available, otherwise use model selection
                if (msg.model) {
                    model = msg.model;
                } else if (config.modelSelection === 'custom') {
                    // Use custom model field
                    if (config.customModelType === 'msg' && msg[config.customModel]) {
                        model = msg[config.customModel];
                    } else if (config.customModelType === 'flow') {
                        model = node.context().flow.get(config.customModel);
                    } else if (config.customModelType === 'global') {
                        model = node.context().global.get(config.customModel);
                    } else if (config.customModelType === 'str') {
                        // Apply Mustache templating for string model names
                        model = renderTemplate(config.customModel, msg, 'custom model');
                    } else {
                        model = config.customModel;
                    }
                } else {
                    // Use selected model from dropdown
                    model = config.modelSelection;
                }

                if (!model) {
                    throw new Error('Model not specified');
                }

                // Resolve prompt - use various sources based on configuration
                let prompt = '';
                if (config.promptType === 'str') {
                    // Apply Mustache templating for string prompts
                    prompt = renderTemplate(config.prompt, msg, 'prompt');
                } else if (config.promptType === 'msg') {
                    prompt = msg[config.prompt] || msg.payload;
                } else if (config.promptType === 'flow') {
                    prompt = node.context().flow.get(config.prompt);
                } else if (config.promptType === 'global') {
                    prompt = node.context().global.get(config.prompt);
                }

                // Fallback to msg.payload if no prompt configured
                if (!prompt && msg.payload) {
                    prompt = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
                }

                if (!prompt) {
                    throw new Error('No prompt provided');
                }

                // Resolve system instruction
                let systemInstruction = null;
                if (config.systemInstructionType === 'str' && config.systemInstruction) {
                    // Apply Mustache templating for string system instructions
                    systemInstruction = renderTemplate(config.systemInstruction, msg, 'system instruction');
                } else if (config.systemInstructionType === 'msg') {
                    systemInstruction = msg[config.systemInstruction];
                } else if (config.systemInstructionType === 'flow') {
                    systemInstruction = node.context().flow.get(config.systemInstruction);
                } else if (config.systemInstructionType === 'global') {
                    systemInstruction = node.context().global.get(config.systemInstruction);
                } else if (msg.systemInstruction) {
                    systemInstruction = msg.systemInstruction;
                }

                // Resolve number of images
                let numberOfImages = config.numberOfImages;
                if (config.numberOfImagesType === 'msg' && msg[config.numberOfImages]) {
                    numberOfImages = msg[config.numberOfImages];
                } else if (config.numberOfImagesType === 'flow') {
                    numberOfImages = node.context().flow.get(config.numberOfImages);
                } else if (config.numberOfImagesType === 'global') {
                    numberOfImages = node.context().global.get(config.numberOfImages);
                } else if (msg.numberOfImages) {
                    numberOfImages = msg.numberOfImages;
                }

                // Validate numberOfImages
                numberOfImages = parseInt(numberOfImages);
                if (isNaN(numberOfImages) || numberOfImages < 1 || numberOfImages > 8) {
                    throw new Error('Number of images must be between 1 and 8');
                }

                // Resolve aspect ratio
                let aspectRatio = config.aspectRatio;
                if (msg.aspectRatio) {
                    aspectRatio = msg.aspectRatio;
                }

                // Validate aspect ratio
                const validAspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
                if (!validAspectRatios.includes(aspectRatio)) {
                    throw new Error(`Invalid aspect ratio: ${aspectRatio}. Must be one of: ${validAspectRatios.join(', ')}`);
                }

                // Initialize Google Generative AI
                const genAI = new GoogleGenAI({apiKey: apiKey});

                // Process input images for editing (check msg.inputImages)
                // Handle both single image and array of images
                let inputImages = [];
                if (msg.inputImages) {
                    if (Array.isArray(msg.inputImages)) {
                        inputImages = msg.inputImages;
                    } else {
                        // Single image - convert to array
                        inputImages = [msg.inputImages];
                    }
                }

                // Show detailed generation status
                const hasInputImages = inputImages.length > 0 || (config.inputFile && config.inputFile.trim());
                const operation = hasInputImages ? 'editing' : 'generating';
                const details = `${numberOfImages}x ${aspectRatio} images`;
                status.setProgress(model, operation, { additional: details });

                // Prepare content array for API request
                const contentParts = [];
                
                // Process input file from configuration first (images should come before text)
                if (config.inputFile && config.inputFile.trim()) {
                    let inputFilePath = config.inputFile;

                    // Resolve input file path based on type
                    if (config.inputFileType === 'msg' && msg[config.inputFile]) {
                        inputFilePath = msg[config.inputFile];
                    } else if (config.inputFileType === 'flow') {
                        inputFilePath = node.context().flow.get(config.inputFile);
                    } else if (config.inputFileType === 'global') {
                        inputFilePath = node.context().global.get(config.inputFile);
                    } else if (config.inputFileType === 'str') {
                        // Apply Mustache templating for string file paths
                        inputFilePath = renderTemplate(config.inputFile, msg, 'input file path');
                    }

                    if (inputFilePath && inputFilePath.trim()) {
                        try {
                            const fileBuffer = await readFromFile(inputFilePath);
                            const mimeType = getMimeType(inputFilePath);
                            const imageData = fileBuffer.toString('base64');
                            
                            contentParts.push({
                                inlineData: {
                                    data: imageData,
                                    mimeType: mimeType
                                }
                            });
                        } catch (error) {
                            throw new Error(`Failed to read input file '${inputFilePath}': ${error.message}`);
                        }
                    }
                }

                // Process additional input images from msg.inputImages array
                if (inputImages.length > 0) {
                    for (const inputImage of inputImages) {
                        let imageData, mimeType;
                        
                        if (typeof inputImage === 'string') {
                            if (inputImage.startsWith('data:')) {
                                // Data URL format
                                const base64Match = inputImage.match(/^data:([^;]+);base64,(.+)$/);
                                if (base64Match) {
                                    mimeType = base64Match[1];
                                    imageData = base64Match[2];
                                } else {
                                    throw new Error('Invalid data URL format in input image');
                                }
                            } else if (inputImage.startsWith('http')) {
                                // URL - fetch the image
                                const imageBuffer = await fetchFromUrl(inputImage);
                                mimeType = getMimeType(inputImage);
                                imageData = imageBuffer.toString('base64');
                            } else {
                                // Assume it's already base64
                                imageData = inputImage.replace(/^data:[^;]+;base64,/, '');
                                mimeType = 'image/jpeg'; // Default
                            }
                        } else if (Buffer.isBuffer(inputImage)) {
                            // Buffer format
                            imageData = inputImage.toString('base64');
                            mimeType = 'image/jpeg'; // Default
                        } else {
                            throw new Error('Invalid input image format. Expected string (URL/base64) or Buffer.');
                        }
                        
                        contentParts.push({
                            inlineData: {
                                data: imageData,
                                mimeType: mimeType
                            }
                        });
                    }
                }
                
                // Add text prompt after all images (proper order for image editing)
                contentParts.push({ text: prompt });
                
                // Debug: Log the content parts structure for troubleshooting
                node.log(`Content parts count: ${contentParts.length}`);
                contentParts.forEach((part, index) => {
                    if (part.text) {
                        node.log(`Part ${index}: Text prompt - "${part.text}"`);
                    } else if (part.inlineData) {
                        node.log(`Part ${index}: Image data - ${part.inlineData.mimeType}, ${part.inlineData.data.length} chars`);
                    }
                });
                
                // Determine response modalities
                let responseModalities = ['Image']; // Default
                const modalitySetting = msg.responseModalities || config.responseModalities || 'image';
                
                switch (modalitySetting) {
                    case 'text':
                        responseModalities = ['Text'];
                        break;
                    case 'both':
                        responseModalities = ['Image', 'Text'];
                        break;
                    case 'image':
                    default:
                        responseModalities = ['Image'];
                        break;
                }

                // Generate images using Gemini image generation
                const request = {
                    model: model,
                    contents: [{ parts: contentParts }],
                    config: {
                        responseModalities: responseModalities
                    }
                };
                
                // Add system instruction if provided
                if (systemInstruction) {
                    request.systemInstruction = {
                        parts: [{ text: systemInstruction }]
                    };
                }

                // Add image config if aspect ratio is specified
                if (aspectRatio) {
                    request.config.imageConfig = {
                        aspectRatio: aspectRatio
                    };
                }
                
                // Add safety settings using shared utility
                SafetyUtils.addSafetySettings(request, config);

                const result = await genAI.models.generateContent(request);
                
                // Check for safety blocks or other API response issues
                if (!result.candidates || result.candidates.length === 0) {
                    throw new Error('No candidates returned by API - content may have been blocked by safety filters');
                }
                
                const candidate = result.candidates[0];
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                    throw new Error(`Content generation blocked: ${candidate.finishReason}. Safety ratings: ${JSON.stringify(candidate.safetyRatings)}`);
                }
                
                // Extract image data from response
                const imageParts = [];
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData) {
                            imageParts.push(part.inlineData.data);
                        }
                    }
                }

                if (imageParts.length === 0) {
                    throw new Error('No images generated in response - check content policies and model capabilities');
                }
                
                // Process images based on output format
                let processedImages = [];
                let imageIndex = 0;
                
                for (const imageData of imageParts) {
                    let processedImage;
                    
                    switch (config.outputFormat) {
                        case 'base64':
                            processedImage = imageData;
                            break;
                        case 'buffer':
                            processedImage = Buffer.from(imageData, 'base64');
                            break;
                        case 'url':
                            // For URL format, we'll return a data URL
                            processedImage = `data:image/png;base64,${imageData}`;
                            break;
                        case 'file':
                            // Save to file and return file path
                            const timestamp = Date.now();
                            const filename = `gemini_image_${timestamp}_${imageIndex}.png`;
                            
                            // Resolve save directory - use config or default to Node-RED user directory
                            let saveDir = config.saveDirectory || RED.settings.userDir || './';
                            if (config.saveDirType === 'msg' && msg[config.saveDirectory]) {
                                saveDir = msg[config.saveDirectory];
                            } else if (config.saveDirType === 'flow') {
                                saveDir = node.context().flow.get(config.saveDirectory);
                            } else if (config.saveDirType === 'global') {
                                saveDir = node.context().global.get(config.saveDirectory);
                            } else if (config.saveDirType === 'str' && config.saveDirectory) {
                                // Apply Mustache templating for string save directory
                                saveDir = renderTemplate(config.saveDirectory, msg, 'save directory');
                            } else if (msg.saveDirectory) {
                                saveDir = msg.saveDirectory;
                            }
                            
                            // Ensure directory exists
                            try {
                                await fs.promises.mkdir(saveDir, { recursive: true });
                            } catch (error) {
                                if (error.code !== 'EEXIST') {
                                    throw new Error(`Failed to create directory '${saveDir}': ${error.message}`);
                                }
                            }
                            
                            const filePath = path.join(saveDir, filename);
                            const imageBuffer = Buffer.from(imageData, 'base64');
                            
                            // Save file asynchronously
                            try {
                                await fs.promises.writeFile(filePath, imageBuffer);
                                processedImage = filePath;
                            } catch (error) {
                                throw new Error(`Failed to save image file '${filePath}': ${error.message}`);
                            }
                            break;
                        default:
                            processedImage = imageData;
                    }
                    
                    processedImages.push(processedImage);
                    imageIndex++;
                }

                // Determine output property name
                const outputProperty = config.outputProperty || 'payload';

                // Prepare success response
                let successMsg;
                if (config.passthroughProperties) {
                    // Include all incoming properties and add metadata
                    successMsg = {
                        ...msg,
                        model: model,
                        prompt: prompt,
                        imageCount: processedImages.length,
                        aspectRatio: aspectRatio,
                        outputFormat: config.outputFormat,
                        usage: result.usageMetadata || null
                    };
                } else {
                    // Only set the output property, no passthrough
                    successMsg = {};
                }

                // Set the generated images to the specified output property (supports dot notation)
                RED.util.setMessageProperty(successMsg, outputProperty, processedImages.length === 1 ? processedImages[0] : processedImages);

                // Show success status with metrics
                const totalSize = imageParts.reduce((sum, img) => sum + (img.length || 0), 0);
                const metrics = { 
                    files: processedImages.length,
                    size: totalSize 
                };
                
                if (config.outputFormat === 'file') {
                    status.setSuccess(model, 'saved images', metrics);
                } else {
                    status.setSuccess(model, 'generated images', metrics);
                }
                
                send([successMsg, null]);
                done();

            } catch (error) {
                // Prepare error response - original message with error object attached
                const errorMsg = {
                    ...msg,  // Preserve ALL original message properties
                    error: {
                        message: error.message,
                        code: error.code || 'UNKNOWN_ERROR',
                        type: error.name || 'Error',
                        details: error.details || null,
                        timestamp: new Date().toISOString()
                    }
                };

                // Set contextual error status
                const operation = config.outputFormat === 'file' ? 'save' : 'generation';
                status.setError(model || 'gemini', error, { operation: operation });
                
                // Route to second output port - flow continues, never halts
                send([null, errorMsg]);
                done(); // Complete successfully - no error passed to done()
            }
        });

        // Clear status when node is being destroyed
        this.on('close', function() {
            node.status({});
        });
    }

    RED.nodes.registerType("gemini-image-generate", GeminiImageGenerateNode);
};