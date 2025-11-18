module.exports = function(RED) {
    "use strict";

    const { GoogleGenAI } = require('@google/genai');
    const fs = require('fs');
    const path = require('path');
    const { renderTemplate } = require('./template-utils');
    const NodeStatus = require('./status-utils');

    // Helper function to create WAV header for PCM audio data
    function createWavHeader(pcmDataLength, sampleRate, numChannels, bitsPerSample) {
        const header = Buffer.alloc(44);
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;

        // RIFF chunk descriptor
        header.write('RIFF', 0);                                    // ChunkID
        header.writeUInt32LE(36 + pcmDataLength, 4);              // ChunkSize
        header.write('WAVE', 8);                                   // Format

        // fmt sub-chunk
        header.write('fmt ', 12);                                  // Subchunk1ID
        header.writeUInt32LE(16, 16);                             // Subchunk1Size (16 for PCM)
        header.writeUInt16LE(1, 20);                              // AudioFormat (1 = PCM)
        header.writeUInt16LE(numChannels, 22);                    // NumChannels
        header.writeUInt32LE(sampleRate, 24);                     // SampleRate
        header.writeUInt32LE(byteRate, 28);                       // ByteRate
        header.writeUInt16LE(blockAlign, 32);                     // BlockAlign
        header.writeUInt16LE(bitsPerSample, 34);                  // BitsPerSample

        // data sub-chunk
        header.write('data', 36);                                  // Subchunk2ID
        header.writeUInt32LE(pcmDataLength, 40);                  // Subchunk2Size

        return header;
    }

    function GeminiSpeechGenerateNode(config) {
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
                model = config.model || 'gemini-2.5-flash-preview-tts';
                if (msg.model) {
                    model = msg.model;
                }

                if (!model) {
                    throw new Error('Model not specified');
                }

                // Resolve text content
                let text = '';
                if (config.textType === 'str') {
                    // Apply Mustache templating for string text
                    text = renderTemplate(config.text, msg, 'text');
                } else if (config.textType === 'msg') {
                    text = msg[config.text] || msg.payload;
                } else if (config.textType === 'flow') {
                    text = node.context().flow.get(config.text);
                } else if (config.textType === 'global') {
                    text = node.context().global.get(config.text);
                }

                // Fallback to msg.payload if no text configured
                if (!text && msg.payload) {
                    text = typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload);
                }

                if (!text) {
                    throw new Error('No text provided for speech generation');
                }

                // Store processed speaker names for later use in multi-speaker config
                let processedSpeaker1Name = null;
                let processedSpeaker2Name = null;

                // Preprocess text for multi-speaker mode to help API recognize speaker format
                if (config.speakerMode === 'multi') {
                    // Resolve and process speaker 1 name
                    let speaker1Name = msg.speaker1Name || config.speaker1Name;
                    if (speaker1Name) {
                        processedSpeaker1Name = typeof speaker1Name === 'string' && !msg.speaker1Name ?
                            renderTemplate(speaker1Name, msg, 'speaker 1 name') : speaker1Name;
                    }

                    // Resolve and process speaker 2 name
                    let speaker2Name = msg.speaker2Name || config.speaker2Name;
                    if (speaker2Name) {
                        processedSpeaker2Name = typeof speaker2Name === 'string' && !msg.speaker2Name ?
                            renderTemplate(speaker2Name, msg, 'speaker 2 name') : speaker2Name;
                    }

                    if (processedSpeaker1Name && processedSpeaker2Name) {
                        // Add instructional preamble to help API parse speaker format correctly
                        text = `TTS the following conversation between ${processedSpeaker1Name} and ${processedSpeaker2Name}:\n${text}`;
                    }
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

                // Show detailed speech generation status
                const textLength = text.length;
                const voiceInfo = config.speakerMode === 'multi' ? 'multi-speaker' : (config.voiceName || msg.voiceName || 'default');
                const details = `${textLength} chars, ${voiceInfo}`;
                status.setProgress(model, 'generating speech', { additional: details });

                // Build request
                const request = {
                    model: model,
                    contents: [{ parts: [{ text: text }] }],
                    config: {
                        responseModalities: ['AUDIO']
                    }
                };
                
                // Add system instruction if provided
                if (systemInstruction) {
                    request.systemInstruction = {
                        parts: [{ text: systemInstruction }]
                    };
                }
                
                // Add generation configuration
                const generationConfig = {};
                
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

                // Configure voice based on speaker mode
                if (config.speakerMode === 'multi') {
                    // Multi-speaker configuration
                    const speakers = [];

                    // Resolve and process speaker 1 voice
                    let speaker1Voice = msg.speaker1Voice || config.speaker1Voice;
                    let processedSpeaker1Voice = null;
                    if (speaker1Voice) {
                        processedSpeaker1Voice = typeof speaker1Voice === 'string' && !msg.speaker1Voice ?
                            renderTemplate(speaker1Voice, msg, 'speaker 1 voice') : speaker1Voice;
                    }

                    // Add speaker 1 if both name and voice are configured
                    if (processedSpeaker1Name && processedSpeaker1Voice) {
                        speakers.push({
                            speaker: processedSpeaker1Name,
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: processedSpeaker1Voice
                                }
                            }
                        });
                    }

                    // Resolve and process speaker 2 voice
                    let speaker2Voice = msg.speaker2Voice || config.speaker2Voice;
                    let processedSpeaker2Voice = null;
                    if (speaker2Voice) {
                        processedSpeaker2Voice = typeof speaker2Voice === 'string' && !msg.speaker2Voice ?
                            renderTemplate(speaker2Voice, msg, 'speaker 2 voice') : speaker2Voice;
                    }

                    // Add speaker 2 if both name and voice are configured
                    if (processedSpeaker2Name && processedSpeaker2Voice) {
                        speakers.push({
                            speaker: processedSpeaker2Name,
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: processedSpeaker2Voice
                                }
                            }
                        });
                    }

                    if (speakers.length > 0) {
                        request.config.speechConfig = {
                            multiSpeakerVoiceConfig: {
                                speakerVoiceConfigs: speakers
                            }
                        };

                        // Debug logging for multi-speaker configuration
                        node.log('Multi-speaker configuration:');
                        node.log(`Speaker 1: ${JSON.stringify(speakers[0])}`);
                        if (speakers[1]) {
                            node.log(`Speaker 2: ${JSON.stringify(speakers[1])}`);
                        }
                    }
                } else {
                    // Single speaker configuration
                    let voiceName = config.voiceName;
                    if (msg.voiceName) {
                        voiceName = msg.voiceName;
                    } else if (config.voiceName) {
                        // Apply Mustache templating for configured voice name
                        voiceName = renderTemplate(config.voiceName, msg, 'voice name');
                    }

                    if (voiceName) {
                        request.config.speechConfig = {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName: voiceName
                                }
                            }
                        };
                    }
                }

                const result = await genAI.models.generateContent(request);

                // Check for API response issues
                if (!result.candidates || result.candidates.length === 0) {
                    throw new Error('No candidates returned by API - content may have been blocked');
                }

                const candidate = result.candidates[0];
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                    throw new Error(`Content generation blocked: ${candidate.finishReason}`);
                }

                // Extract audio data from response
                let audioData = null;
                let audioMimeType = null;
                if (candidate.content && candidate.content.parts) {
                    for (const part of candidate.content.parts) {
                        if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
                            audioData = part.inlineData.data;
                            audioMimeType = part.inlineData.mimeType;
                            node.log(`Audio received with MIME type: ${audioMimeType}`);
                            break;
                        }
                    }
                }

                if (!audioData) {
                    throw new Error('No audio generated in response');
                }

                // Parse MIME type to get base type (strip parameters)
                // e.g., "audio/L16;codec=pcm;rate=24000" → "audio/l16"
                const baseMimeType = audioMimeType.split(';')[0].toLowerCase().trim();

                // Convert PCM to WAV format for compatibility
                if (baseMimeType === 'audio/l16' || baseMimeType === 'audio/pcm') {
                    node.log('Converting PCM audio to WAV format');

                    // Parse sample rate from MIME type parameters (default: 24000 from API spec)
                    let sampleRate = 24000;
                    const rateMatch = audioMimeType.match(/rate=(\d+)/i);
                    if (rateMatch) {
                        sampleRate = parseInt(rateMatch[1]);
                    }

                    // Audio specs from Gemini API: mono, 16-bit PCM
                    const numChannels = 1;
                    const bitsPerSample = 16;

                    // Convert base64 to Buffer
                    const pcmBuffer = Buffer.from(audioData, 'base64');

                    // Create WAV header
                    const wavHeader = createWavHeader(pcmBuffer.length, sampleRate, numChannels, bitsPerSample);

                    // Combine header + PCM data
                    const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

                    // Convert back to base64 for storage
                    audioData = wavBuffer.toString('base64');
                    audioMimeType = 'audio/wav';

                    node.log(`Converted PCM to WAV: ${sampleRate}Hz, ${numChannels}ch, ${bitsPerSample}bit`);
                }

                // Determine file extension from MIME type
                const finalMimeType = audioMimeType.split(';')[0].toLowerCase().trim();
                const mimeToExt = {
                    'audio/wav': 'wav',
                    'audio/wave': 'wav',
                    'audio/x-wav': 'wav',
                    'audio/mp3': 'mp3',
                    'audio/mpeg': 'mp3'
                };
                const fileExt = mimeToExt[finalMimeType] || 'wav'; // Default to WAV

                // Process audio based on output format
                let processedAudio;
                const timestamp = Date.now();

                // Resolve filename
                let filename = '';
                if (config.filenameType === 'str' && config.filename) {
                    // Apply Mustache templating for string filename
                    filename = renderTemplate(config.filename, msg, 'filename');
                } else if (config.filenameType === 'msg' && config.filename) {
                    filename = msg[config.filename] || '';
                } else if (config.filenameType === 'flow') {
                    filename = node.context().flow.get(config.filename) || '';
                } else if (config.filenameType === 'global') {
                    filename = node.context().global.get(config.filename) || '';
                } else if (msg.filename) {
                    filename = msg.filename;
                }

                // If no filename specified, use timestamp-based default
                if (!filename) {
                    filename = `gemini_speech_${timestamp}.${fileExt}`;
                } else {
                    // Ensure filename has correct extension
                    const hasExtension = filename.match(/\.(wav|mp3)$/i);
                    if (!hasExtension) {
                        filename = `${filename}.${fileExt}`;
                    }
                }

                switch (config.outputFormat) {
                    case 'base64':
                        processedAudio = audioData;
                        break;
                    case 'buffer':
                        processedAudio = Buffer.from(audioData, 'base64');
                        break;
                    case 'url':
                        // For URL format, return a data URL with correct MIME type
                        processedAudio = `data:${audioMimeType};base64,${audioData}`;
                        break;
                    case 'file':
                        // Save to file and return file path
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
                        const audioBuffer = Buffer.from(audioData, 'base64');

                        // Save file asynchronously
                        try {
                            await fs.promises.writeFile(filePath, audioBuffer);
                            processedAudio = filePath;
                        } catch (error) {
                            throw new Error(`Failed to save audio file '${filePath}': ${error.message}`);
                        }
                        break;
                    default:
                        processedAudio = audioData;
                }

                // Determine output property name
                const outputProperty = config.outputProperty || 'payload';

                // Prepare success response
                // Always preserve incoming message properties
                let successMsg = {...msg};

                // Add additional metadata properties if passthrough is enabled
                if (config.passthroughProperties) {
                    successMsg.model = model;
                    successMsg.text = text;
                    successMsg.voiceConfig = config.speakerMode === 'multi' ? 'multi-speaker' : config.voiceName;
                    successMsg.speakerMode = config.speakerMode;
                    successMsg.outputFormat = config.outputFormat;
                    successMsg.audioMimeType = audioMimeType;
                    successMsg.usage = result.usageMetadata || null;
                }

                // Set the generated audio to the specified output property (supports dot notation)
                RED.util.setMessageProperty(successMsg, outputProperty, processedAudio);

                // Show success status with metrics
                const audioSize = Buffer.from(audioData, 'base64').length;
                const metrics = { size: audioSize };
                
                if (config.outputFormat === 'file') {
                    metrics.files = 1;
                    status.setSuccess(model, 'saved audio', metrics);
                } else {
                    status.setSuccess(model, 'generated speech', metrics);
                }
                
                send([successMsg, null]);
                done();

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
                const operation = config.outputFormat === 'file' ? 'save' : 'speech generation';
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

    RED.nodes.registerType("gemini-speech-generate", GeminiSpeechGenerateNode);
};