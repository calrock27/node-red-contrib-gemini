const mustache = require('mustache');

/**
 * Render a Mustache template with message context
 * Supports both {{payload}} and {{msg.payload}} syntax
 *
 * @param {string} template - The template string to render
 * @param {object} msg - The Node-RED message object
 * @param {string} fieldName - Name of the field (for error messages)
 * @returns {string} The rendered template
 * @throws {Error} If template rendering fails
 */
function renderTemplate(template, msg, fieldName) {
    if (!template || typeof template !== 'string') {
        return template;
    }

    try {
        // Create context supporting both {{payload}} and {{msg.payload}} syntaxes
        const context = { ...msg, msg: msg };
        return mustache.render(template, context);
    } catch (e) {
        throw new Error(`Mustache template error in ${fieldName}: ${e.message}`);
    }
}

module.exports = { renderTemplate };
