/**
 * Status management utilities for Node-RED Gemini nodes
 * Provides consistent, informative status messages across all nodes
 */

class NodeStatus {
    constructor(node) {
        this.node = node;
        this.startTime = Date.now();
    }

    /**
     * Set progress status with operation details
     * @param {string} model - Model being used
     * @param {string} operation - Current operation description
     * @param {Object} details - Additional details like progress, metrics
     */
    setProgress(model, operation, details = {}) {
        const modelName = this.getShortModelName(model);
        let text = `${modelName}: ${operation}`;
        
        if (details.progress !== undefined) {
            text += ` (${details.progress}%)`;
        }
        
        if (details.additional) {
            text += ` - ${details.additional}`;
        }
        
        if (details.count !== undefined) {
            text += ` (${details.count})`;
        }
        
        this.node.status({ 
            fill: "blue", 
            shape: "dot", 
            text: this.truncateMessage(text, 50)
        });
    }

    /**
     * Set success status with completion metrics
     * @param {string} model - Model used
     * @param {string} operation - Completed operation
     * @param {Object} metrics - Performance metrics
     */
    setSuccess(model, operation, metrics = {}) {
        const elapsed = Date.now() - this.startTime;
        const modelName = this.getShortModelName(model);
        let text = `${modelName}: ${operation}`;
        
        const parts = [];
        
        if (metrics.duration !== false) {
            parts.push(`${(elapsed / 1000).toFixed(1)}s`);
        }
        
        if (metrics.tokens) {
            parts.push(`${metrics.tokens} tokens`);
        }
        
        if (metrics.files) {
            parts.push(`${metrics.files} files`);
        }
        
        if (metrics.size) {
            parts.push(this.formatBytes(metrics.size));
        }
        
        if (parts.length > 0) {
            text += ` (${parts.join(', ')})`;
        }
        
        this.node.status({ 
            fill: "green", 
            shape: "dot", 
            text: this.truncateMessage(text, 50)
        });

        // Auto-clear after delay
        setTimeout(() => this.node.status({}), 3000);
    }

    /**
     * Set error status with context
     * @param {string} model - Model that failed
     * @param {Error} error - Error object
     * @param {Object} context - Additional context
     */
    setError(model, error, context = {}) {
        const modelName = this.getShortModelName(model);
        let text;
        
        if (context.operation) {
            text = `${modelName}: ${context.operation} failed`;
        } else {
            text = `${modelName}: error`;
        }
        
        // Add specific error context
        if (error.message.includes('Content generation blocked')) {
            const blockReason = this.extractBlockReason(error.message);
            text = `${modelName}: blocked (${blockReason})`;
        } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
            text = `${modelName}: rate limited`;
        } else if (error.message.includes('API key')) {
            text = `${modelName}: invalid API key`;
        } else if (error.message.includes('Model not')) {
            text = `${modelName}: model not found`;
        } else {
            // Truncate long error messages
            const errorMsg = this.truncateMessage(error.message, 30);
            text += ` - ${errorMsg}`;
        }
        
        this.node.status({ 
            fill: "red", 
            shape: "ring", 
            text: this.truncateMessage(text, 50)
        });
    }

    /**
     * Set chat-specific status
     * @param {string} model - Model being used
     * @param {string} sessionId - Chat session ID
     * @param {number} historyLength - Number of messages in history
     * @param {boolean} isNew - Whether this is a new session
     */
    setChatStatus(model, sessionId, historyLength, isNew = false) {
        const modelName = this.getShortModelName(model);
        const sessionName = sessionId === 'default' ? 'default' : this.truncateMessage(sessionId, 10);
        const status = isNew ? 'new chat' : 'chatting';
        
        this.setProgress(model, status, {
            additional: `${sessionName}, ${historyLength} msgs`
        });
    }

    /**
     * Set streaming-specific status
     * @param {string} model - Model being used
     * @param {number} chunkCount - Number of chunks received
     * @param {string} fullText - Current accumulated text
     */
    setStreamingStatus(model, chunkCount, fullText = '') {
        const modelName = this.getShortModelName(model);
        const tokenCount = this.estimateTokens(fullText);
        
        this.setProgress(model, 'streaming', {
            additional: `${chunkCount} chunks, ${tokenCount} tokens`
        });
    }

    /**
     * Set multimodal-specific status
     * @param {string} model - Model being used
     * @param {Object} content - Content being processed
     */
    setMultimodalStatus(model, content) {
        const modelName = this.getShortModelName(model);
        const { imageCount = 0, videoCount = 0, audioCount = 0 } = content;
        
        const mediaTypes = [];
        if (imageCount > 0) mediaTypes.push(`${imageCount} images`);
        if (videoCount > 0) mediaTypes.push(`${videoCount} videos`);
        if (audioCount > 0) mediaTypes.push(`${audioCount} audio`);
        
        const mediaText = mediaTypes.length > 0 ? mediaTypes.join(' + ') + ' + text' : 'text';
        
        this.setProgress(model, 'analyzing', {
            additional: mediaText
        });
    }

    /**
     * Clear status
     */
    clear() {
        this.node.status({});
    }

    // Helper methods

    /**
     * Get shortened model name for display
     * @param {string} model - Full model name
     * @returns {string} Shortened name
     */
    getShortModelName(model) {
        if (!model) return 'gemini';
        
        // Extract key parts of model name
        if (model.includes('gemini-2.5-flash')) return 'flash-2.5';
        if (model.includes('gemini-2.5-pro')) return 'pro-2.5';
        if (model.includes('gemini-2.0-flash')) return 'flash-2.0';
        if (model.includes('gemini-1.5-pro')) return 'pro-1.5';
        if (model.includes('gemini-1.5-flash')) return 'flash-1.5';
        if (model.includes('imagen')) return 'imagen';
        if (model.includes('flash-image')) return 'flash-img';
        
        // Fallback to first part
        return model.split('-')[0] || model.substring(0, 10);
    }

    /**
     * Truncate message to fit status display
     * @param {string} message - Message to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated message
     */
    truncateMessage(message, maxLength) {
        if (!message) return '';
        return message.length > maxLength 
            ? message.substring(0, maxLength - 3) + '...'
            : message;
    }

    /**
     * Format bytes to human readable format
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted string
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
    }

    /**
     * Estimate token count from text (rough approximation)
     * @param {string} text - Text to estimate
     * @returns {number} Estimated token count
     */
    estimateTokens(text) {
        if (!text) return 0;
        // Rough estimate: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    /**
     * Extract block reason from error message
     * @param {string} message - Error message
     * @returns {string} Block reason
     */
    extractBlockReason(message) {
        if (message.includes('SEXUALLY_EXPLICIT')) return 'sexual';
        if (message.includes('HARASSMENT')) return 'harassment';
        if (message.includes('HATE_SPEECH')) return 'hate';
        if (message.includes('DANGEROUS_CONTENT')) return 'dangerous';
        if (message.includes('IMAGE_SAFETY')) return 'image safety';
        return 'safety';
    }
}

module.exports = NodeStatus;