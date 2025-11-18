module.exports = function(RED) {
    "use strict";

    const { GoogleGenAI } = require('@google/genai');
    const fs = require('fs');
    const path = require('path');
    const { renderTemplate } = require('./template-utils');
    const NodeStatus = require('./status-utils');
    const SafetyUtils = require('./safety-utils');

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

    // Helper function to get MIME type from file extension
    function getMimeType(filePathOrName) {
        const ext = path.extname(filePathOrName).toLowerCase();
        const mimeTypes = {
            '.wav': 'audio/wav',
            '.mp3': 'audio/mp3',
            '.aiff': 'audio/aiff',
            '.aac': 'audio/aac',
            '.ogg': 'audio/ogg',
            '.flac': 'audio/flac'
        };
        return mimeTypes[ext] || 'audio/wav';
    }

    // Helper function to write analysis to file
    async function writeAnalysisToFile(text, saveDirectory, node) {
        try {
            // Determine save directory
            let targetDir = saveDirectory || path.join(RED.settings.userDir || process.env.NODE_RED_HOME || ".", "audio-analysis");
            
            // Ensure directory exists
            try {
                await fs.promises.mkdir(targetDir, { recursive: true });
            } catch (error) {
                if (error.code !== 'EEXIST') {
                    throw new Error(`Failed to create directory '${targetDir}': ${error.message}`);
                }
            }
            
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const filename = `audio-analysis-${timestamp}.txt`;
            const filePath = path.join(targetDir, filename);
            
            // Write file asynchronously
            await fs.promises.writeFile(filePath, text, 'utf8');
            node.log(`Analysis saved to: ${filePath}`);
            return filePath;
        } catch (error) {
            throw new Error(`File save error: ${error.message}`);
        }
    }

    function GeminiAudioUnderstandNode(config) {
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

            // Initialize variables that may be referenced in error handler
            let model = null;

            try {
                // Validate API key
                if (!node.apiKeyConfig || !node.apiKeyConfig.credentials || !node.apiKeyConfig.credentials.apikey) {
                    throw new Error('API key not configured. Please configure a Gemini API Key.');
                }

                const apiKey = node.apiKeyConfig.credentials.apikey;

                // Resolve model
                model = config.model || 'gemini-2.5-flash';
                if (msg.model) {
                    model = msg.model;
                }

                if (!model) {
                    throw new Error('Model not specified');
                }

                // Resolve prompt text
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

                // Fallback to default prompt if none provided
                if (!prompt) {
                    prompt = "Please analyze this audio and provide a detailed description of what you hear.";
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

                // Initialize Google Generative AI
                const genAI = new GoogleGenAI({apiKey: apiKey});

                // Show detailed analysis status after processing audio files
                let audioFileCount = 0;
                if (config.audioFile && config.audioFile.trim()) audioFileCount++;
                if (msg.audioData) audioFileCount++;
                if (msg.audioFiles && Array.isArray(msg.audioFiles)) audioFileCount += msg.audioFiles.length;
                
                status.setMultimodalStatus(model, { audioCount: audioFileCount });

                // Prepare content parts array
                const contentParts = [];

                // Process audio from file path if configured
                if (config.audioFile && config.audioFile.trim()) {
                    let audioFilePath = config.audioFile;

                    // Resolve audio file path based on type
                    if (config.audioFileType === 'msg' && msg[config.audioFile]) {
                        audioFilePath = msg[config.audioFile];
                    } else if (config.audioFileType === 'flow') {
                        audioFilePath = node.context().flow.get(config.audioFile);
                    } else if (config.audioFileType === 'global') {
                        audioFilePath = node.context().global.get(config.audioFile);
                    } else if (config.audioFileType === 'str') {
                        // Apply Mustache templating for string file paths
                        audioFilePath = renderTemplate(config.audioFile, msg, 'audio file path');
                    }

                    if (audioFilePath && audioFilePath.trim()) {
                        try {
                            const fileBuffer = await readFromFile(audioFilePath);
                            const mimeType = getMimeType(audioFilePath);
                            const audioData = fileBuffer.toString('base64');
                            
                            contentParts.push({
                                inlineData: {
                                    data: audioData,
                                    mimeType: mimeType
                                }
                            });
                        } catch (error) {
                            throw new Error(`Failed to read audio file '${audioFilePath}': ${error.message}`);
                        }
                    }
                }

                // Process inline audio data from message
                if (msg.audioData) {
                    let audioData, mimeType;
                    
                    if (typeof msg.audioData === 'string') {
                        if (msg.audioData.startsWith('data:')) {
                            // Data URL format
                            const base64Match = msg.audioData.match(/^data:([^;]+);base64,(.+)$/);
                            if (base64Match) {
                                mimeType = base64Match[1];
                                audioData = base64Match[2];
                            } else {
                                throw new Error('Invalid data URL format in msg.audioData');
                            }
                        } else {
                            // Assume it's already base64
                            audioData = msg.audioData.replace(/^data:[^;]+;base64,/, '');
                            mimeType = msg.audioMimeType || 'audio/wav';
                        }
                    } else if (Buffer.isBuffer(msg.audioData)) {
                        // Buffer format
                        audioData = msg.audioData.toString('base64');
                        mimeType = msg.audioMimeType || 'audio/wav';
                    } else {
                        throw new Error('Invalid audio data format. Expected string (base64/data URL) or Buffer.');
                    }
                    
                    contentParts.push({
                        inlineData: {
                            data: audioData,
                            mimeType: mimeType
                        }
                    });
                }

                // Process additional audio files from message array
                if (msg.audioFiles && Array.isArray(msg.audioFiles)) {
                    for (const audioFile of msg.audioFiles) {
                        let audioData, mimeType;
                        
                        if (typeof audioFile === 'string') {
                            // File path - read the file
                            try {
                                const fileBuffer = await readFromFile(audioFile);
                                mimeType = getMimeType(audioFile);
                                audioData = fileBuffer.toString('base64');
                            } catch (error) {
                                throw new Error(`Failed to read audio file '${audioFile}': ${error.message}`);
                            }
                        } else if (audioFile.data && audioFile.mimeType) {
                            // Audio object with data and mimeType
                            audioData = audioFile.data;
                            mimeType = audioFile.mimeType;
                        } else {
                            throw new Error('Invalid audio file format in audioFiles array');
                        }
                        
                        contentParts.push({
                            inlineData: {
                                data: audioData,
                                mimeType: mimeType
                            }
                        });
                    }
                }

                if (contentParts.length === 0) {
                    throw new Error('No audio data provided. Use audioFile configuration, msg.audioData, or msg.audioFiles');
                }

                // Add text prompt after audio
                contentParts.push({ text: prompt });

                // Debug: Log the content parts structure
                node.log(`Processing ${contentParts.length - 1} audio file(s) with prompt: "${prompt}"`);

                // Build API request
                const request = {
                    model: model,
                    contents: [{ parts: contentParts }]
                };
                
                // Add generation configuration parameters
                const generationConfig = {};
                
                // Resolve temperature
                let temperature = config.temperature;
                if (config.temperatureType === 'msg' && msg[config.temperature] !== undefined) {
                    temperature = msg[config.temperature];
                } else if (config.temperatureType === 'flow') {
                    temperature = node.context().flow.get(config.temperature);
                } else if (config.temperatureType === 'global') {
                    temperature = node.context().global.get(config.temperature);
                } else if (msg.temperature !== undefined) {
                    temperature = msg.temperature;
                }
                
                if (temperature !== undefined && temperature !== null && temperature !== '') {
                    generationConfig.temperature = parseFloat(temperature);
                }
                
                // Resolve topP
                let topP = config.topP;
                if (config.topPType === 'msg' && msg[config.topP] !== undefined) {
                    topP = msg[config.topP];
                } else if (config.topPType === 'flow') {
                    topP = node.context().flow.get(config.topP);
                } else if (config.topPType === 'global') {
                    topP = node.context().global.get(config.topP);
                } else if (msg.topP !== undefined) {
                    topP = msg.topP;
                }
                
                if (topP !== undefined && topP !== null && topP !== '') {
                    generationConfig.topP = parseFloat(topP);
                }
                
                // Resolve topK
                let topK = config.topK;
                if (config.topKType === 'msg' && msg[config.topK] !== undefined) {
                    topK = msg[config.topK];
                } else if (config.topKType === 'flow') {
                    topK = node.context().flow.get(config.topK);
                } else if (config.topKType === 'global') {
                    topK = node.context().global.get(config.topK);
                } else if (msg.topK !== undefined) {
                    topK = msg.topK;
                }
                
                if (topK !== undefined && topK !== null && topK !== '') {
                    generationConfig.topK = parseInt(topK);
                }
                
                // Resolve maxOutputTokens
                let maxOutputTokens = config.maxOutputTokens;
                if (config.maxOutputTokensType === 'msg' && msg[config.maxOutputTokens] !== undefined) {
                    maxOutputTokens = msg[config.maxOutputTokens];
                } else if (config.maxOutputTokensType === 'flow') {
                    maxOutputTokens = node.context().flow.get(config.maxOutputTokens);
                } else if (config.maxOutputTokensType === 'global') {
                    maxOutputTokens = node.context().global.get(config.maxOutputTokens);
                } else if (msg.maxOutputTokens !== undefined) {
                    maxOutputTokens = msg.maxOutputTokens;
                }
                
                if (maxOutputTokens !== undefined && maxOutputTokens !== null && maxOutputTokens !== '') {
                    generationConfig.maxOutputTokens = parseInt(maxOutputTokens);
                }
                
                if (Object.keys(generationConfig).length > 0) {
                    request.generationConfig = generationConfig;
                }
                
                // Add system instruction if provided
                if (systemInstruction) {
                    request.systemInstruction = {
                        parts: [{ text: systemInstruction }]
                    };
                }
                
                // Add safety settings using shared utility
                SafetyUtils.addSafetySettings(request, config);

                const result = await genAI.models.generateContent(request);

                // Check for API response issues
                if (!result.candidates || result.candidates.length === 0) {
                    throw new Error('No candidates returned by API - content may have been blocked');
                }

                const candidate = result.candidates[0];
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                    throw new Error(`Content generation blocked: ${candidate.finishReason}. Safety ratings: ${JSON.stringify(candidate.safetyRatings)}`);
                }

                // Extract text response
                const text = candidate.content.parts[0].text;

                // Determine output property name
                const outputProperty = config.outputProperty || 'payload';

                // Handle output format
                if (config.outputFormat === 'file') {
                    // Save to file
                    try {
                        // Resolve save directory
                        let saveDirectory = config.saveDirectory;
                        if (config.saveDirType === 'msg' && msg[config.saveDirectory]) {
                            saveDirectory = msg[config.saveDirectory];
                        } else if (config.saveDirType === 'flow') {
                            saveDirectory = node.context().flow.get(config.saveDirectory);
                        } else if (config.saveDirType === 'global') {
                            saveDirectory = node.context().global.get(config.saveDirectory);
                        } else if (config.saveDirType === 'str' && config.saveDirectory) {
                            // Apply Mustache templating for string save directory
                            saveDirectory = renderTemplate(config.saveDirectory, msg, 'save directory');
                        } else if (msg.saveDirectory) {
                            saveDirectory = msg.saveDirectory;
                        }

                        const filePath = await writeAnalysisToFile(text, saveDirectory, node);

                        // Prepare success response with file path
                        // Always preserve incoming message properties
                        let successMsg = {...msg};

                        // Add additional metadata properties if passthrough is enabled
                        if (config.passthroughProperties) {
                            successMsg.model = model;
                            successMsg.prompt = prompt;
                            successMsg.audioCount = contentParts.length - 1;
                            successMsg.usage = result.usageMetadata || null;
                            successMsg.safetyRatings = candidate.safetyRatings || null;
                            successMsg.savedToFile = true;
                            successMsg.filePath = filePath;
                        }

                        // Set the file path to the specified output property (supports dot notation)
                        RED.util.setMessageProperty(successMsg, outputProperty, filePath);

                        // Show file save success status
                        const fileSize = Buffer.byteLength(text, 'utf8');
                        status.setSuccess(model, 'saved analysis', { 
                            files: 1,
                            size: fileSize 
                        });
                        
                        send([successMsg, null]);
                        done();
                    } catch (fileError) {
                        throw new Error(`File save failed: ${fileError.message}`);
                    }
                } else {
                    // Text only output (default)
                    // Prepare success response
                    // Always preserve incoming message properties
                    let successMsg = {...msg};

                    // Add additional metadata properties if passthrough is enabled
                    if (config.passthroughProperties) {
                        successMsg.model = model;
                        successMsg.prompt = prompt;
                        successMsg.audioCount = contentParts.length - 1; // Subtract 1 for the text prompt
                        successMsg.usage = result.usageMetadata || null;
                        successMsg.safetyRatings = candidate.safetyRatings || null;
                    }

                    // Set the analysis result to the specified output property (supports dot notation)
                    RED.util.setMessageProperty(successMsg, outputProperty, text);

                    // Show analysis success status
                    const tokens = result.usageMetadata?.totalTokenCount || status.estimateTokens(text);
                    status.setSuccess(model, 'analyzed audio', { tokens: tokens });
                    
                    send([successMsg, null]);
                    done();
                }

            } catch (error) {
                // Prepare error response
                const errorMsg = {
                    ...msg,
                    error: {
                        message: error.message,
                        code: error.code || 'UNKNOWN_ERROR',
                        type: error.name || 'Error',
                        details: error.details || null,
                        timestamp: new Date().toISOString()
                    }
                };

                // Set contextual error status
                const operation = config.outputFormat === 'file' ? 'file save' : 'analysis';
                status.setError(model || 'gemini', error, { operation: operation });

                // Make error catchable by catch nodes
                node.error(error.message, errorMsg);

                // Route to second output port
                send([null, errorMsg]);
                done();
            }
        });

        // Clear status when node is being destroyed
        this.on('close', function() {
            node.status({});
        });
    }

    RED.nodes.registerType("gemini-audio-understand", GeminiAudioUnderstandNode);
};