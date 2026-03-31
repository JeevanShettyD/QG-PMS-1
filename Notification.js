'use strict';

/**
 * QGPMS Notification Model
 * 
 * Styles: 'success' | 'error' | 'verified' | 'dark'
 * 
 * Usage (same as before):
 *   new Notification('Title', 'Message body', 'success', 5000)
 *   new Notification('Title', 'Message body', 'error')
 */

const VALID_STYLES = ['success', 'error', 'verified', 'dark'];
const DEFAULT_STYLE = 'verified';
const DEFAULT_DISMISS = 5000;

module.exports = class Notification {
  constructor(title, content, style, time) {
    this.title       = typeof title === 'string' && title.trim() ? title.trim() : 'Notification';
    this.content     = typeof content === 'string' ? content.trim() : '';
    this.style       = VALID_STYLES.includes(style) ? style : DEFAULT_STYLE;
    this.dismissAfter = typeof time === 'number' && time > 0 ? time : DEFAULT_DISMISS;
    this.closeButton  = true;
    this.timestamp    = Date.now();
  }
};