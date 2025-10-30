module.exports = function(RED) {
    "use strict";

    const { GoogleGenAI } = require('@google/genai');
    const fs = require('fs');
    const https = require('https');
    const http = require('http');
    const path = require('path');
    const { renderTemplate } = require('./template-utils');
    const NodeStatus = require('./status-utils');
    const SafetyUtils = require('./safety-utils');

    // Helper function to fetch content from URL
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
            '.mp4': 'video/mp4',
            '.avi': 'video/avi',
            '.mov': 'video/quicktime',
            '.webm': 'video/webm'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }

    // Helper function to process multimodal inputs
    async function processMultimodalInputs(multimodalConfig, msg) {
        const parts = [];
        
        if (!multimodalConfig || !Array.isArray(multimodalConfig)) {
            return parts;
        }

        for (const input of multimodalConfig) {
            try {
                let content, mimeType;

                switch (input.type) {
                    case 'text':
                        parts.push({ text: input.value });
                        break;

                    case 'image-url':
                    case 'video-url':
                        content = await fetchFromUrl(input.value);
                        mimeType = getMimeType(input.value);
                        parts.push({
                            inlineData: {
                                data: content.toString('base64'),
                                mimeType: mimeType
                            }
                        });
                        break;

                    case 'image-file':
                    case 'video-file':
                        content = await readFromFile(input.value);
                        mimeType = getMimeType(input.value);
                        parts.push({
                            inlineData: {
                                data: content.toString('base64'),
                                mimeType: mimeType
                            }
                        });
                        break;

                    case 'image-msg':
                    case 'video-msg':
                        const msgData = msg[input.value] || msg.payload;
                        if (!msgData) {
                            throw new Error(`No data found at ${input.value}`);
                        }

                        let base64Data;
                        if (Buffer.isBuffer(msgData)) {
                            base64Data = msgData.toString('base64');
                        } else if (typeof msgData === 'string') {
                            // Assume it's already base64 or convert if needed
                            base64Data = msgData.replace(/^data:[^;]+;base64,/, '');
                        } else {
                            throw new Error(`Invalid data type for ${input.value}`);
                        }

                        // Default MIME type if not detectable
                        mimeType = input.type.startsWith('image') ? 'image/jpeg' : 'video/mp4';
                        parts.push({
                            inlineData: {
                                data: base64Data,
                                mimeType: mimeType
                            }
                        });
                        break;

                    default:
                        throw new Error(`Unsupported multimodal input type: ${input.type}`);
                }
            } catch (error) {
                throw new Error(`Multimodal input error (${input.type}): ${error.message}`);
            }
        }

        return parts;
    }

    function GeminiGenerateContentNode(config) {
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

                // Process multimodal inputs
                let multimodalParts = [];
                try {
                    // Parse the JSON string back to array
                    let multimodalConfig = [];
                    if (config.multimodalInputsData) {
                        try {
                            multimodalConfig = JSON.parse(config.multimodalInputsData);
                        } catch (e) {
                            // Error parsing multimodalInputsData, using empty array
                            multimodalConfig = [];
                        }
                    }
                    multimodalParts = await processMultimodalInputs(multimodalConfig, msg);
                    
                    // Also check for runtime multimodal inputs from msg.multimodal
                    if (msg.multimodal && Array.isArray(msg.multimodal)) {
                        const runtimeParts = await processMultimodalInputs(msg.multimodal, msg);
                        multimodalParts = multimodalParts.concat(runtimeParts);
                    }
                } catch (error) {
                    throw new Error(`Multimodal processing failed: ${error.message}`);
                }

                // Prepare content for API - combine text prompt with multimodal parts
                let content;
                if (multimodalParts.length > 0) {
                    // Multimodal content: text + media
                    content = [{ text: prompt }, ...multimodalParts];
                } else {
                    // Text-only content
                    content = prompt;
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

                // Validate mode support
                if (config.mode !== 'single' && config.mode !== 'streaming' && config.mode !== 'chat') {
                    throw new Error(`Mode '${config.mode}' is not yet supported. Currently supports: single, streaming, chat`);
                }
                

                // Initialize Google Generative AI
                const genAI = new GoogleGenAI({apiKey: apiKey});

                if (config.mode === 'chat') {
                    // Chat (Multi-turn) mode - use msg.topic as session ID
                    const sessionId = msg.topic || 'default';

                    // Get or create chat history for this session
                    let chatHistories = node.context().get('chatHistories') || {};
                    let chatHistory = chatHistories[sessionId] || [];

                    const isNewChat = chatHistory.length === 0;

                    if (isNewChat) {
                        // Show new chat status
                        status.setChatStatus(model, sessionId, 0, true);
                    } else {
                        // Show existing chat status with history length
                        status.setChatStatus(model, sessionId, chatHistory.length, false);
                    }

                    // Add the user's message to the history
                    chatHistory.push({
                        role: 'user',
                        parts: Array.isArray(content) ? content : [{ text: content }]
                    });

                    // Build request with full conversation history
                    const request = {
                        model: model,
                        contents: chatHistory,
                        config: {}
                    };

                    // Add system instruction if provided
                    if (systemInstruction) {
                        request.config.systemInstruction = {
                            parts: [{ text: systemInstruction }]
                        };
                    }

                    // Add generation configuration (minimal for chat)
                    if (config.temperature !== undefined && config.temperature !== null && config.temperature !== '') {
                        request.config.temperature = parseFloat(config.temperature);
                    }

                    // Add safety settings
                    SafetyUtils.addSafetySettings(request.config, config);

                    // Add grounding if enabled
                    if (config.grounding) {
                        request.config.tools = [{ googleSearch: {} }];
                    }

                    // Remove empty config if nothing was added
                    if (Object.keys(request.config).length === 0) {
                        delete request.config;
                    }

                    // Call the API with full history
                    const result = await genAI.models.generateContent(request);
                    const text = result.text;

                    // Handle cases where no text is returned
                    if (!text) {
                        throw new Error('No response text generated. This may be due to safety filters or grounding issues.');
                    }

                    // Add the model's response to the history
                    chatHistory.push({
                        role: 'model',
                        parts: [{ text: text }]
                    });

                    // Store updated chat history
                    chatHistories[sessionId] = chatHistory;
                    node.context().set('chatHistories', chatHistories);

                    // Determine output property name
                    const outputProperty = config.outputProperty || 'payload';

                    // Prepare success response with chat metadata
                    let successMsg;
                    if (config.passthroughProperties) {
                        // Include all incoming properties and add metadata
                        successMsg = {
                            ...msg,
                            model: model,
                            usage: result.usageMetadata || null,
                            safetyRatings: result.candidates?.[0]?.safetyRatings || null,
                            grounding: config.grounding || false,
                            chat: {
                                sessionId: sessionId,
                                historyLength: chatHistory.length
                            }
                        };
                    } else {
                        // Only set the output property, no passthrough
                        successMsg = {};
                    }

                    // Set the generated content to the specified output property (supports dot notation)
                    RED.util.setMessageProperty(successMsg, outputProperty, text);

                    // Show chat success status
                    const tokens = result.usageMetadata?.totalTokenCount || status.estimateTokens(text);
                    status.setSuccess(model, 'chat completed', { tokens: tokens });

                    send([successMsg, null]);
                    done();

                } else if (config.mode === 'streaming') {
                    // Streaming mode - send multiple messages as chunks arrive
                    const operation = config.grounding ? 'streaming+search' : 'streaming';
                    status.setProgress(model, operation);

                    // Build request with model and content
                    const request = {
                        model: model,
                        contents: [{
                            parts: Array.isArray(content) ? content : [{ text: content }]
                        }],
                        config: {}
                    };

                    // Add system instruction if provided
                    if (systemInstruction) {
                        request.config.systemInstruction = {
                            parts: [{ text: systemInstruction }]
                        };
                    }

                    // Resolve thinking budget
                    let thinkingBudget = config.thinkingBudget;
                    if (config.thinkingBudgetType === 'msg' && msg[config.thinkingBudget] !== undefined) {
                        thinkingBudget = msg[config.thinkingBudget];
                    } else if (config.thinkingBudgetType === 'flow') {
                        thinkingBudget = node.context().flow.get(config.thinkingBudget);
                    } else if (config.thinkingBudgetType === 'global') {
                        thinkingBudget = node.context().global.get(config.thinkingBudget);
                    } else if (msg.thinkingBudget !== undefined) {
                        thinkingBudget = msg.thinkingBudget;
                    }

                    if (thinkingBudget !== undefined && thinkingBudget !== null && thinkingBudget !== '') {
                        request.config.thinkingBudget = parseInt(thinkingBudget);
                    }

                    // Add includeThoughts if enabled
                    if (config.includeThoughts || msg.includeThoughts) {
                        request.config.includeThoughts = true;
                    }

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
                        request.config.temperature = parseFloat(temperature);
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
                        request.config.topP = parseFloat(topP);
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
                        request.config.topK = parseInt(topK);
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
                        request.config.maxOutputTokens = parseInt(maxOutputTokens);
                    }

                    // Add safety settings using shared utility
                    SafetyUtils.addSafetySettings(request.config, config);

                    // Add grounding if enabled
                    if (config.grounding) {
                        request.config.tools = [{ googleSearch: {} }];
                    }

                    // Remove empty config if nothing was added
                    if (Object.keys(request.config).length === 0) {
                        delete request.config;
                    }

                    // Determine output property name
                    const outputProperty = config.outputProperty || 'payload';

                    const result = await genAI.models.generateContentStream(request);
                    let chunkCount = 0;
                    let fullText = '';

                    for await (const chunk of result) {
                        const chunkText = chunk.text || '';
                        fullText += chunkText;
                        chunkCount++;

                        // Send each chunk as a separate message
                        const chunkMsg = {
                            ...msg,
                            model: model,
                            streaming: {
                                chunk: chunkCount,
                                isPartial: true,
                                fullText: fullText
                            }
                        };

                        // Set the chunk content to the specified output property (supports dot notation)
                        RED.util.setMessageProperty(chunkMsg, outputProperty, chunkText);

                        // Update streaming status with progress
                        status.setStreamingStatus(model, chunkCount, fullText);
                        send([chunkMsg, null]);
                    }

                    // Handle cases where no text is returned
                    if (!fullText && chunkCount === 0) {
                        throw new Error('No response text generated. This may be due to safety filters or grounding issues.');
                    }

                    // Send final message with complete response
                    const finalMsg = {
                        ...msg,
                        model: model,
                        usage: result.response?.usageMetadata || null,
                        safetyRatings: result.response?.candidates?.[0]?.safetyRatings || null,
                        grounding: config.grounding || false,
                        streaming: {
                            chunk: chunkCount + 1,
                            isPartial: false,
                            totalChunks: chunkCount,
                            fullText: fullText,
                            isComplete: true
                        }
                    };

                    // Set the complete text to the specified output property (supports dot notation)
                    RED.util.setMessageProperty(finalMsg, outputProperty, fullText);

                    // Show streaming success status
                    const tokens = status.estimateTokens(fullText);
                    status.setSuccess(model, 'streaming completed', { 
                        tokens: tokens,
                        duration: true // Show timing
                    });
                    
                    send([finalMsg, null]);
                    done();

                } else {
                    // Single Turn mode - detect multimodal content
                    const isMultimodal = multimodalParts.length > 0;
                    let operation;
                    
                    if (config.grounding && isMultimodal) {
                        operation = 'analyzing+search';
                        // Show multimodal status
                        const imageCount = multimodalParts.filter(p => p.inlineData && p.inlineData.mimeType.startsWith('image')).length;
                        const videoCount = multimodalParts.filter(p => p.inlineData && p.inlineData.mimeType.startsWith('video')).length;
                        status.setMultimodalStatus(model, { imageCount, videoCount });
                    } else if (isMultimodal) {
                        operation = 'analyzing';
                        const imageCount = multimodalParts.filter(p => p.inlineData && p.inlineData.mimeType.startsWith('image')).length;
                        const videoCount = multimodalParts.filter(p => p.inlineData && p.inlineData.mimeType.startsWith('video')).length;
                        status.setMultimodalStatus(model, { imageCount, videoCount });
                    } else if (config.grounding) {
                        operation = 'generating+search';
                        status.setProgress(model, operation);
                    } else {
                        operation = 'generating';
                        status.setProgress(model, operation);
                    }

                    // Build request with model and content
                    const request = {
                        model: model,
                        contents: [{
                            parts: Array.isArray(content) ? content : [{ text: content }]
                        }],
                        config: {}
                    };

                    // Add system instruction if provided
                    if (systemInstruction) {
                        request.config.systemInstruction = {
                            parts: [{ text: systemInstruction }]
                        };
                    }

                    // Resolve thinking budget
                    let thinkingBudget = config.thinkingBudget;
                    if (config.thinkingBudgetType === 'msg' && msg[config.thinkingBudget] !== undefined) {
                        thinkingBudget = msg[config.thinkingBudget];
                    } else if (config.thinkingBudgetType === 'flow') {
                        thinkingBudget = node.context().flow.get(config.thinkingBudget);
                    } else if (config.thinkingBudgetType === 'global') {
                        thinkingBudget = node.context().global.get(config.thinkingBudget);
                    } else if (msg.thinkingBudget !== undefined) {
                        thinkingBudget = msg.thinkingBudget;
                    }

                    if (thinkingBudget !== undefined && thinkingBudget !== null && thinkingBudget !== '') {
                        request.config.thinkingBudget = parseInt(thinkingBudget);
                    }

                    // Add includeThoughts if enabled
                    if (config.includeThoughts || msg.includeThoughts) {
                        request.config.includeThoughts = true;
                    }

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
                        request.config.temperature = parseFloat(temperature);
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
                        request.config.topP = parseFloat(topP);
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
                        request.config.topK = parseInt(topK);
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
                        request.config.maxOutputTokens = parseInt(maxOutputTokens);
                    }

                    // Add safety settings using shared utility
                    SafetyUtils.addSafetySettings(request.config, config);

                    // Add grounding if enabled
                    if (config.grounding) {
                        request.config.tools = [{ googleSearch: {} }];
                    }

                    // Remove empty config if nothing was added
                    if (Object.keys(request.config).length === 0) {
                        delete request.config;
                    }

                    const result = await genAI.models.generateContent(request);
                    const text = result.text;

                    // Handle cases where no text is returned
                    if (!text) {
                        throw new Error('No response text generated. This may be due to safety filters or grounding issues.');
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
                            usage: result.usageMetadata || null,
                            safetyRatings: result.candidates?.[0]?.safetyRatings || null,
                            grounding: config.grounding || false
                        };
                    } else {
                        // Only set the output property, no passthrough
                        successMsg = {};
                    }

                    // Set the generated content to the specified output property (supports dot notation)
                    RED.util.setMessageProperty(successMsg, outputProperty, text);

                    // Show success status with metrics
                    const tokens = result.usageMetadata?.totalTokenCount || status.estimateTokens(text);
                    status.setSuccess(model, 'completed', { tokens: tokens });
                    
                    send([successMsg, null]);
                    done();
                }

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
                const operation = config.mode === 'chat' ? 'chat' : 
                                config.mode === 'streaming' ? 'streaming' : 'generation';
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

    RED.nodes.registerType("gemini-generate-content", GeminiGenerateContentNode);
};