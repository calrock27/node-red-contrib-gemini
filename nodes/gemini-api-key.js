module.exports = function(RED) {
    "use strict";

    function GeminiApiKeyNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
    }

    RED.nodes.registerType("gemini-api-key", GeminiApiKeyNode, {
        credentials: {
            apikey: { type: "password" }
        }
    });

    // Helper function for other nodes to get API key
    GeminiApiKeyNode.getApiKey = function(configNodeId) {
        if (!configNodeId) {
            return null;
        }
        
        const configNode = RED.nodes.getNode(configNodeId);
        if (!configNode || !configNode.credentials || !configNode.credentials.apikey) {
            return null;
        }
        
        return configNode.credentials.apikey;
    };

    // Validation function for API key format
    GeminiApiKeyNode.validateApiKey = function(apikey) {
        if (!apikey || typeof apikey !== 'string') {
            return false;
        }
        
        // Basic validation - Google AI API keys typically start with 'AI' and are around 39 characters
        if (!apikey.startsWith('AI') || apikey.length < 30) {
            return false;
        }
        
        return true;
    };

    // Export helper functions for other nodes to use
    GeminiApiKeyNode.getApiKey = function(configNodeId) {
        if (!configNodeId) {
            return null;
        }
        
        const configNode = RED.nodes.getNode(configNodeId);
        if (!configNode || !configNode.credentials || !configNode.credentials.apikey) {
            return null;
        }
        
        return configNode.credentials.apikey;
    };

    GeminiApiKeyNode.validateApiKey = function(apikey) {
        if (!apikey || typeof apikey !== 'string') {
            return false;
        }
        
        // Basic validation - Google AI API keys typically start with 'AI' and are around 39 characters
        if (!apikey.startsWith('AI') || apikey.length < 30) {
            return false;
        }
        
        return true;
    };
};