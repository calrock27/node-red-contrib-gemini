/**
 * Safety Settings Utility Module
 * Provides consistent safety settings handling across all Gemini nodes
 */

module.exports = {
    /**
     * Add safety settings to an API request object
     * Only adds settings that are explicitly configured (not empty/unspecified)
     *
     * @param {Object} request - The API request object to add safety settings to
     * @param {Object} config - The node configuration object containing safety settings
     * @returns {Object} The request object with safety settings added (if any)
     */
    addSafetySettings: function(request, config) {
        const safetySettings = [];

        // Harassment
        if (config.safetyHarassment &&
            config.safetyHarassment !== '' &&
            config.safetyHarassment !== 'HARM_BLOCK_THRESHOLD_UNSPECIFIED') {
            safetySettings.push({
                category: 'HARM_CATEGORY_HARASSMENT',
                threshold: config.safetyHarassment
            });
        }

        // Hate Speech
        if (config.safetyHateSpeech &&
            config.safetyHateSpeech !== '' &&
            config.safetyHateSpeech !== 'HARM_BLOCK_THRESHOLD_UNSPECIFIED') {
            safetySettings.push({
                category: 'HARM_CATEGORY_HATE_SPEECH',
                threshold: config.safetyHateSpeech
            });
        }

        // Sexually Explicit
        if (config.safetySexuallyExplicit &&
            config.safetySexuallyExplicit !== '' &&
            config.safetySexuallyExplicit !== 'HARM_BLOCK_THRESHOLD_UNSPECIFIED') {
            safetySettings.push({
                category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                threshold: config.safetySexuallyExplicit
            });
        }

        // Dangerous Content
        if (config.safetyDangerousContent &&
            config.safetyDangerousContent !== '' &&
            config.safetyDangerousContent !== 'HARM_BLOCK_THRESHOLD_UNSPECIFIED') {
            safetySettings.push({
                category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                threshold: config.safetyDangerousContent
            });
        }

        // Only add to request if we have settings configured
        if (safetySettings.length > 0) {
            request.safetySettings = safetySettings;
        }

        return request;
    },

    /**
     * Safety setting categories as defined by Google's API
     */
    categories: {
        HARASSMENT: 'HARM_CATEGORY_HARASSMENT',
        HATE_SPEECH: 'HARM_CATEGORY_HATE_SPEECH',
        SEXUALLY_EXPLICIT: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        DANGEROUS_CONTENT: 'HARM_CATEGORY_DANGEROUS_CONTENT'
    },

    /**
     * Safety threshold values as defined by Google's API
     */
    thresholds: {
        UNSPECIFIED: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
        BLOCK_LOW_AND_ABOVE: 'BLOCK_LOW_AND_ABOVE',
        BLOCK_MEDIUM_AND_ABOVE: 'BLOCK_MEDIUM_AND_ABOVE',
        BLOCK_ONLY_HIGH: 'BLOCK_ONLY_HIGH',
        BLOCK_NONE: 'BLOCK_NONE'
    }
};
