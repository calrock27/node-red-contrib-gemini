# node-red-contrib-gemini

A comprehensive Node-RED package providing nodes for Google's Gemini AI API, including text generation, chat, image generation, audio understanding, and speech synthesis.

## Overview

This package offers five specialized nodes that integrate with Google's Gemini AI models, providing a complete set of AI capabilities within Node-RED flows. Each node is designed for production use with comprehensive error handling, flexible configuration options, and consistent user experience patterns.

**Included Nodes:**
- **gemini-api-key** - Secure API credential management (config node)
- **gemini-generate-content** - Text generation, chat, and vision analysis
- **gemini-image-generate** - Image generation and editing
- **gemini-audio-understand** - Audio analysis and transcription
- **gemini-speech-generate** - Text-to-speech synthesis

## Features

- **Text Generation and Chat** - Single-turn, streaming, and multi-turn conversations
- **Vision Analysis** - Multimodal prompts with image and video support
- **Image Generation** - Create and edit images using Imagen and Gemini models
- **Audio Understanding** - Analyze and transcribe audio content
- **Speech Synthesis** - Convert text to natural speech with multi-speaker support
- **Mustache Templating** - Dynamic content insertion in all string fields
- **Flexible Output** - Customizable output properties with dot notation support
- **Google Search Grounding** - Real-time web search integration
- **Streaming Support** - Real-time token-by-token responses
- **File Operations** - Save generated content directly to files

## Disclaimer
This package was written with Claude Code. I'm not a developer by trade and am new to Git as a whole. This is also my first node-red package. I had a use for interfacing with Gemini in my node-red setup and wanted a better way of doing it. I tried to add features that I thought may be useful to a broader audience. I'll do my best to support this and keep it functional. I hope it's able to make your flows a little bit more robust :) 

Instructions were given to stay within the confines of the Gemini API documentation https://ai.google.dev/gemini-api/docs as well as the Node.js SDK written by Google https://github.com/googleapis/js-genai. It was built against SDK version 1.27.0

## Installation

### From Node-RED Palette Manager

1. Open your Node-RED instance
2. Go to the menu (☰) → **Manage palette**
3. Click the **Install** tab
4. Search for `node-red-contrib-gemini`
5. Click **Install**

### From npm

```bash
cd ~/.node-red
npm install node-red-contrib-gemini
```

### Manual Installation (Development)

```bash
cd /path/to/node-red-contrib-gemini
npm install
npm link
cd ~/.node-red
npm link node-red-contrib-gemini
```

After making changes, restart Node-RED to see updates.

## Setup

### 1. Get Your Google AI API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the generated API key

### 2. Configure the API Key Node

1. Drag a **gemini-api-key** config node into your flow editor
2. Double-click to open the configuration
3. Enter a friendly **Name** (optional)
4. Paste your API key into the **API Key** field
5. Click **Done**

**Security Note:** API keys are stored using Node-RED's secure credential system and are encrypted.

### 3. Start Using Gemini Nodes

All functional nodes (gemini-generate-content, gemini-image-generate, etc.) will have an **API Key** dropdown where you can select your configured key.

## Node Reference

### gemini-api-key (Config Node)

Securely stores Google AI API credentials for use by all other nodes.

**Configuration:**
- **Name**: Optional friendly identifier
- **API Key**: Your Google AI API key from AI Studio

### gemini-generate-content

The core node for text generation, chat, and vision tasks.

**Key Features:**
- **Modes**: Single Turn, Streaming, Chat (Multi-turn)
- **Models**: gemini-2.5-pro, gemini-2.5-flash, gemini-2.5-flash-lite, or custom models
- **Mustache Templating**: All text fields support `{{payload}}` or `{{msg.propertyName}}` syntax
- **Multimodal**: Text, images, videos from URLs, files, or message data
- **Grounding**: Google Search integration for real-time information
- **Advanced Settings**: Temperature, Top-P, Top-K, safety settings
- **Chat Sessions**: Persistent conversations using `msg.topic` as session ID

**Inputs:**
- `msg.payload` - Text prompt or content
- `msg.topic` - Chat session ID (for multi-turn mode)
- `msg.model` - Override model selection
- `msg.multimodal` - Additional multimodal content

**Outputs:**
- **Output 1 (Success)**: Generated content with metadata
- **Output 2 (Error)**: Error details with original message

### gemini-image-generate

Generate images using Google's Imagen models.

**Configuration:**
- **Mode**: Generate (create new images) or Edit (modify existing images)
- **Model**: gemini-2.5-flash-image, imagen-3.0-generate-001, or custom model
- **Prompt**: Detailed image description (supports Mustache templating)
- **Input File**: For edit mode - path to image to modify
- **Number of Images**: 1-8 depending on model
- **Aspect Ratio**: 1:1, 16:9, 9:16, 4:3, 3:4
- **Output Format**: Base64, Buffer, URL, or File
- **Output Property**: Customize where results are stored

**Inputs:**
- `msg.payload` - Image generation/edit prompt
- `msg.numberOfImages` - Override image count
- `msg.aspectRatio` - Override aspect ratio
- `msg.inputImages` - Array of images for edit mode (URLs, file paths, or base64)
- `msg.model` - Override model selection

**Outputs:**
- **Output 1 (Success)**: Generated/edited image(s) in specified format with metadata
- **Output 2 (Error)**: Error details with original message

### gemini-audio-understand

Analyze and understand audio content with AI.

**Features:**
- Audio file analysis from file paths
- Inline audio data processing (base64, buffers)
- Multiple audio format support (WAV, MP3, AIFF, AAC, OGG, FLAC)
- Flexible prompt customization
- Optional file output for analysis results
- Generation configuration options
- Safety settings

**Configuration:**
- **Model**: Model for audio understanding
- **Audio File**: Path to audio file with TypedInput support
- **Prompt**: Analysis instruction with TypedInput support
- **Output Format**: Text output or save to file
- **Output Property**: Message property for analysis results
- **Advanced Configuration**: Generation parameters, system instructions, safety settings

**Inputs:**
- `msg.audioData` - Audio data (base64 string, data URL, or Buffer)
- `msg.audioFiles` - Array of audio files or data objects
- `msg.audioMimeType` - MIME type for audio data

**Outputs:**
- **Output 1 (Success)**: Audio analysis with metadata
- **Output 2 (Error)**: Error details with original message

### gemini-speech-generate

Convert text to speech using Gemini's speech synthesis models.

**Features:**
- Text-to-speech conversion
- Single and multi-speaker voice support
- Multiple output formats (base64, buffer, URL, file)
- Configurable voice selection
- Speaker configuration for multi-speaker content
- Generation controls

**Configuration:**
- **Model**: Speech generation model
- **Text**: Input text with TypedInput support
- **Speaker Mode**: Single or multi-speaker
- **Voice Configuration**: Voice selection and speaker setup
- **Output Format**: How to return audio (base64/buffer/URL/file)
- **Output Property**: Message property for generated audio
- **Advanced Configuration**: System instructions and generation parameters

**Inputs:**
- `msg.payload` - Text to convert to speech
- `msg.voiceName` - Override voice selection
- `msg.maxOutputTokens` - Override token limit

**Outputs:**
- **Output 1 (Success)**: Generated audio with metadata
- **Output 2 (Error)**: Error details with original message


## Example Flows

Import these flows directly into Node-RED by copying the JSON and using **Import** from the menu (☰).

### 1. Simple Text Generation with Grounding

Uses Google Search grounding to answer questions with real-time web data. This example checks if a movie has an after-credits scene.

<details>
<summary>Click to expand flow JSON</summary>

```json
[{"id":"7c41675671016995","type":"group","z":"a6c480dcb27b87bd","style":{"stroke":"#999999","stroke-opacity":"1","fill":"none","fill-opacity":"1","label":true,"label-position":"nw","color":"#a4a4a4"},"nodes":["e8a423a769b8dec0","0553c65f94a35371","14a2617d6e1c1a49"],"x":74,"y":459,"w":892,"h":82},{"id":"e8a423a769b8dec0","type":"gemini-generate-content","z":"a6c480dcb27b87bd","g":"7c41675671016995","name":"","apiKey":"fe0d58f14ac27f69","modelSelection":"gemini-2.5-flash","customModel":"","customModelType":"str","mode":"single","prompt":"Does the movie {{msg.payload.movie}} have an after credits scene? Answer as briefly as possible. ","promptType":"str","multimodalInputsData":"[]","grounding":true,"temperature":"1","temperatureType":"num","topP":"0.95","topPType":"num","topK":"64","topKType":"num","maxOutputTokens":"8192","maxOutputTokensType":"num","safetyHarassment":"BLOCK_MEDIUM_AND_ABOVE","safetyHateSpeech":"BLOCK_MEDIUM_AND_ABOVE","safetySexuallyExplicit":"BLOCK_MEDIUM_AND_ABOVE","safetyDangerousContent":"BLOCK_MEDIUM_AND_ABOVE","thinkingBudget":"-1","thinkingBudgetType":"num","includeThoughts":false,"systemInstruction":"","systemInstructionType":"str","outputProperty":"msg.payload.details","x":470,"y":500,"wires":[[["14a2617d6e1c1a49"],["14a2617d6e1c1a49"]]]},{"id":"0553c65f94a35371","type":"inject","z":"a6c480dcb27b87bd","g":"7c41675671016995","name":"Send Movie Example","props":[{"p":"payload.movie","v":"The Long Walk","vt":"str"}],"repeat":"","crontab":"","once":false,"onceDelay":0.1,"topic":"","x":220,"y":500,"wires":[["e8a423a769b8dec0"]]},{"id":"14a2617d6e1c1a49","type":"debug","z":"a6c480dcb27b87bd","g":"7c41675671016995","name":"Text generate debug","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","statusVal":"","statusType":"auto","x":820,"y":500,"wires":[]},{"id":"fe0d58f14ac27f69","type":"gemini-api-key","name":"node-red-free"}]
```

</details>

**Features demonstrated:**
- Mustache templating in prompts (`{{msg.payload.movie}}`)
- Google Search grounding for real-time data
- Custom output property (`msg.payload.details`)

---

### 2. Speech Generation → Audio Understanding Pipeline

Generates multi-speaker speech and then transcribes it, demonstrating the complete audio workflow. Shows how nodes can be chained together seamlessly.

<details>
<summary>Click to expand flow JSON</summary>

```json
[{"id":"e853ab82cdb9436c","type":"group","z":"a6c480dcb27b87bd","style":{"stroke":"#999999","stroke-opacity":"1","fill":"none","fill-opacity":"1","label":true,"label-position":"nw","color":"#a4a4a4"},"nodes":["eba78a6484fd41a0","ec11788db1f8ad68","f06072a81460fba7","7e5e2bc15661e2c7","887cf6ec214ba54b"],"x":74,"y":559,"w":1272,"h":142},{"id":"eba78a6484fd41a0","type":"gemini-speech-generate","z":"a6c480dcb27b87bd","g":"e853ab82cdb9436c","name":"","apiKey":"fe0d58f14ac27f69","model":"gemini-2.5-flash-preview-tts","text":"james: Hello! I have no idea what I'm doing. blueman: This is a test of the multi-speaker generation with gemini in node-red","textType":"str","speakerMode":"multi","voiceName":"","speaker1Name":"james","speaker1Voice":"Achernar","speaker2Name":"blueman","speaker2Voice":"Iapetus","outputFormat":"buffer","saveDirectory":"","saveDirType":"str","filename":"itsatest2","filenameType":"str","systemInstruction":"","systemInstructionType":"str","maxOutputTokens":"","maxOutputTokensType":"num","outputProperty":"msg.audioData","x":570,"y":660,"wires":[[["f06072a81460fba7","7e5e2bc15661e2c7"],["f06072a81460fba7"]]]},{"id":"ec11788db1f8ad68","type":"inject","z":"a6c480dcb27b87bd","g":"e853ab82cdb9436c","name":"Generate audio and then understand it","props":[{"p":"payload"},{"p":"topic","vt":"str"}],"repeat":"","crontab":"","once":false,"onceDelay":0.1,"topic":"","payload":"","payloadType":"date","x":270,"y":660,"wires":[["eba78a6484fd41a0"]]},{"id":"f06072a81460fba7","type":"debug","z":"a6c480dcb27b87bd","g":"e853ab82cdb9436c","name":"Speech generate debug","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","statusVal":"","statusType":"auto","x":950,"y":660,"wires":[]},{"id":"7e5e2bc15661e2c7","type":"gemini-audio-understand","z":"a6c480dcb27b87bd","g":"e853ab82cdb9436c","name":"","apiKey":"fe0d58f14ac27f69","model":"gemini-2.5-flash","prompt":"Transcribe this for me, identifying individual speakers","promptType":"str","audioFile":"","audioFileType":"str","systemInstruction":"","systemInstructionType":"str","temperature":"","temperatureType":"num","topP":"","topPType":"num","topK":"","topKType":"num","maxOutputTokens":"","maxOutputTokensType":"num","safetyHarassment":"BLOCK_MEDIUM_AND_ABOVE","safetyHateSpeech":"BLOCK_MEDIUM_AND_ABOVE","safetySexuallyExplicit":"BLOCK_MEDIUM_AND_ABOVE","safetyDangerousContent":"BLOCK_MEDIUM_AND_ABOVE","outputFormat":"text","saveDirectory":"","saveDirType":"str","outputProperty":"payload","x":870,"y":600,"wires":[[["887cf6ec214ba54b"],["887cf6ec214ba54b"]]]},{"id":"887cf6ec214ba54b","type":"debug","z":"a6c480dcb27b87bd","g":"e853ab82cdb9436c","name":"Audio understand debug","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","statusVal":"","statusType":"auto","x":1190,"y":600,"wires":[]},{"id":"fe0d58f14ac27f69","type":"gemini-api-key","name":"node-red-free"}]
```

</details>

**Features demonstrated:**
- Multi-speaker speech generation (2 distinct voices)
- Custom voice selection (Achernar, Iapetus)
- Chaining speech → audio understanding
- Buffer format output
- Speaker identification in transcription

---

### 3. Image Generation and Editing Pipeline

Generates an image from a text prompt, then edits the generated image with a modification prompt. Demonstrates the full image generation workflow.

<details>
<summary>Click to expand flow JSON</summary>

```json
[{"id":"be4d6ff6a36494ee","type":"group","z":"a6c480dcb27b87bd","style":{"stroke":"#999999","stroke-opacity":"1","fill":"none","fill-opacity":"1","label":true,"label-position":"nw","color":"#a4a4a4"},"nodes":["6fc837881ae39da0","c48c713b1208e241","a7f861aa9e06a8bb","a773e54e40b4e08b","f877c30efdbbeeeb","18ea36bf88be42b6","ea909ae5b69bfe15"],"x":64,"y":739,"w":1562,"h":262},{"id":"6fc837881ae39da0","type":"gemini-image-generate","z":"a6c480dcb27b87bd","g":"be4d6ff6a36494ee","name":"Generate Image","apiKey":"86f1d6e41a7140a9","modelSelection":"gemini-2.5-flash-image","customModel":"","customModelType":"str","prompt":"Generate an image of Scooby Doo having fun with his best friend, a green banana. They should be in a jurassic era volcanic setting with dinosaurs lurking","promptType":"str","numberOfImages":"1","numberOfImagesType":"num","aspectRatio":"1:1","outputFormat":"base64","saveDirectory":"","saveDirType":"str","mode":"generate","inputFile":"","inputFileType":"str","outputProperty":"msg.inputImages","systemInstruction":"","systemInstructionType":"str","responseModalities":"image","safetyHarassment":"BLOCK_MEDIUM_AND_ABOVE","safetyHateSpeech":"BLOCK_MEDIUM_AND_ABOVE","safetySexuallyExplicit":"BLOCK_MEDIUM_AND_ABOVE","safetyDangerousContent":"BLOCK_MEDIUM_AND_ABOVE","x":440,"y":800,"wires":[[["c48c713b1208e241","ea909ae5b69bfe15","a773e54e40b4e08b"],["ea909ae5b69bfe15"]]]},{"id":"c48c713b1208e241","type":"image viewer","z":"a6c480dcb27b87bd","g":"be4d6ff6a36494ee","name":"","width":"580","data":"inputImages","dataType":"msg","active":true,"x":930,"y":780,"wires":[[]]},{"id":"a7f861aa9e06a8bb","type":"inject","z":"a6c480dcb27b87bd","g":"be4d6ff6a36494ee","name":"Test image gen and edit","props":[],"repeat":"","crontab":"","once":false,"onceDelay":0.1,"topic":"","x":210,"y":800,"wires":[["6fc837881ae39da0"]]},{"id":"a773e54e40b4e08b","type":"gemini-image-generate","z":"a6c480dcb27b87bd","g":"be4d6ff6a36494ee","name":"Modify Image","apiKey":"86f1d6e41a7140a9","modelSelection":"gemini-2.5-flash-image","customModel":"","customModelType":"str","prompt":"Add a spooky jack o' lantern on top of scooby's head","promptType":"str","numberOfImages":"1","numberOfImagesType":"num","aspectRatio":"1:1","outputFormat":"base64","saveDirectory":"","saveDirType":"str","mode":"edit","inputFile":"","inputFileType":"str","outputProperty":"payload","systemInstruction":"","systemInstructionType":"str","responseModalities":"image","safetyHarassment":"BLOCK_MEDIUM_AND_ABOVE","safetyHateSpeech":"BLOCK_MEDIUM_AND_ABOVE","safetySexuallyExplicit":"BLOCK_MEDIUM_AND_ABOVE","safetyDangerousContent":"BLOCK_MEDIUM_AND_ABOVE","x":500,"y":960,"wires":[[["f877c30efdbbeeeb","18ea36bf88be42b6"],["f877c30efdbbeeeb"]]]},{"id":"f877c30efdbbeeeb","type":"debug","z":"a6c480dcb27b87bd","g":"be4d6ff6a36494ee","name":"image 2 debug","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","statusVal":"","statusType":"auto","x":760,"y":860,"wires":[]},{"id":"18ea36bf88be42b6","type":"image viewer","z":"a6c480dcb27b87bd","g":"be4d6ff6a36494ee","name":"","width":"580","data":"payload","dataType":"msg","active":true,"x":1530,"y":780,"wires":[[]]},{"id":"ea909ae5b69bfe15","type":"debug","z":"a6c480dcb27b87bd","g":"be4d6ff6a36494ee","name":"image 1 debug","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"true","targetType":"full","statusVal":"","statusType":"auto","x":760,"y":820,"wires":[]},{"id":"86f1d6e41a7140a9","type":"gemini-api-key","name":"node-red-paid"}]
```

</details>

**Features demonstrated:**
- Image generation from text prompt
- Image editing mode (modify existing image)
- Base64 output format
- Chaining generation → editing
- Multiple output properties (`msg.inputImages` → `payload`)
- 1:1 aspect ratio

**Note:** This example uses `node-red-contrib-image-tools` for the image viewer nodes. Install separately if needed.

---

## Advanced Usage

### Mustache Templating

All nodes support Mustache templating in string fields, allowing dynamic content insertion from message properties.

**Supported syntax:**
- Short form: `{{payload}}`, `{{topic}}`, `{{propertyName}}`
- Explicit form: `{{msg.payload}}`, `{{msg.topic}}`, `{{msg.propertyName}}`

**Examples:**
```
Prompt: "Analyze this {{msg.topic}}: {{payload}}"
File path: "/data/{{msg.username}}/{{msg.filename}}.png"
Model: "gemini-{{msg.version}}-flash"
Voice: "{{msg.preferredVoice}}"
```

**Supported fields by node:**
- **gemini-generate-content**: Prompt, system instructions, custom model names
- **gemini-image-generate**: Prompt, system instructions, custom model names, file paths, save directories
- **gemini-speech-generate**: Text content, system instructions, voice names, speaker names, save directories
- **gemini-audio-understand**: Prompt, system instructions, audio file paths, save directories

### Output Property Configuration

All nodes support customizable output properties with dot notation for creating nested objects:

```javascript
// Setting output property to "analysis.result" creates:
msg.analysis = {
    result: "generated content here"
}

// Setting to "payload.gemini.response" creates:
msg.payload = {
    gemini: {
        response: "generated content here"
    }
}
```

This allows you to:
- Preserve existing message data by writing to a specific property
- Organize results in a structured way
- Avoid overwriting important message properties

### Chat Sessions

Use `msg.topic` to maintain separate conversation histories:

```javascript
// In a function node before gemini-generate-content
msg.topic = "user-" + msg.userId; // Unique session per user
msg.payload = "Continue our conversation about AI";
return msg;
```

### Multimodal Content

Add images dynamically to your prompts:

```javascript
// In a function node
msg.multimodal = [
    {
        type: "image-url",
        value: "https://example.com/image.jpg"
    },
    {
        type: "text", 
        value: "Additional context for the image"
    }
];
return msg;
```

### Audio Processing Pipeline

Combine audio understanding with speech generation:

```javascript
// Process audio file and generate speech response
// First: Analyze audio with gemini-audio-understand
// Then: Use result for speech generation
msg.payload = "Please summarize what was said and respond with advice";
msg.audioData = "/path/to/audio/file.wav";
return msg;
```

### Image Editing

The gemini-image-generate node supports both generation and editing modes:

```javascript
// Edit an existing image
msg.payload = "Transform this into a watercolor painting style";
msg.inputImages = [
    "https://example.com/photo.jpg",  // URL
    "/path/to/local/image.png",        // File path
    "data:image/jpeg;base64,/9j/4AA..."  // Base64 data URL
];
return msg;
```

**Edit mode features:**
- Modify existing images with natural language prompts
- Support for multiple input formats (URL, file path, base64)
- Can process multiple images at once
- Maintains aspect ratio or apply transformations
- Style transfer, object addition/removal, and more

## Error Handling

All nodes use a dual-output design for robust error handling:

- **Output 1**: Successful responses with generated content
- **Output 2**: Error responses with detailed error information

Connect both outputs to handle success and error cases appropriately.

## Troubleshooting

### Common Issues

**"API key not configured"**
- Ensure you've created a gemini-api-key config node
- Verify the API key is correctly entered
- Check that the config node is selected in your functional nodes

**"Model not found"**
- Check the [official documentation](https://ai.google.dev/gemini-api/docs/models) for available models
- Ensure model names are spelled correctly
- Some models may not be available in all regions

**"Rate limit exceeded"**
- Implement delays between requests
- Use the error output to handle rate limit responses
- Consider caching responses where appropriate

**Vision/Multimodal errors**
- Ensure images are in supported formats (JPEG, PNG, WebP)
- Check image URLs are publicly accessible
- Verify image file sizes are within API limits

**Audio processing errors**
- Verify audio files are in supported formats (WAV, MP3, AIFF, AAC, OGG, FLAC)
- Check audio file paths are accessible
- Ensure audio data is properly formatted (base64 or Buffer)

**Speech generation errors**
- Verify text input is not empty
- Check voice name is valid for the selected model
- Ensure output directory exists and is writable for file output

### Getting Help

- Check the Node-RED debug panel for detailed error messages
- Review the help documentation for each node
- Verify your API key has the necessary permissions
- Consult the [Google AI documentation](https://ai.google.dev/gemini-api/docs)


## License

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

