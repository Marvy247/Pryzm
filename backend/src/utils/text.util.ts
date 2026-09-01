/**
 * Text Utility Functions
 * Helpers for cleaning and processing text content
 */

/**
 * Clean signal/tweet text by removing errant backslashes and fixing formatting
 * Handles multiple common issues from LLM JSON output:
 * - Literal "\\n" strings that should be actual newlines
 * - Trailing backslashes used as line separators
 * - Double backslashes
 * - Inconsistent spacing/newlines
 * 
 * Examples:
 * - "entry: $0.046\" -> "entry: $0.046"
 * - "🎯 $SUI day trade\\n⏱️ hold: 6-12h" -> "🎯 $SUI day trade\n⏱️ hold: 6-12h"
 * - "conf: 92%\\nlong limit" -> "conf: 92%\nlong limit"
 * 
 * @param text The raw text to clean
 * @returns Cleaned text with proper formatting
 */
export function cleanSignalText(text: string): string {
  if (!text) return text;
  
  let cleaned = text;
  
  // CRITICAL: Convert literal "\n" strings to actual newlines
  // This handles cases where LLM outputs "\\n" in JSON which becomes "\n" string literal
  cleaned = cleaned.replace(/\\n/g, '\n');
  
  // Remove trailing backslashes that are used as line separators
  // This pattern matches a backslash followed by optional whitespace and newline (or end of string)
  cleaned = cleaned.replace(/\\(\s*\n|\s*$)/g, '\n');
  
  // Also handle cases where backslash is at the end of lines without proper newlines
  // e.g., "entry: $0.046\" becomes "entry: $0.046"
  cleaned = cleaned.replace(/\\$/gm, '');
  
  // Handle double backslash sequences that may appear in some formats
  cleaned = cleaned.replace(/\\\\/g, '');
  
  // Clean up any resulting triple+ newlines (keep max 2)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Trim trailing whitespace from each line
  cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');
  
  return cleaned.trim();
}

/**
 * Normalize line endings to Unix style
 * @param text Text with potentially mixed line endings
 * @returns Text with Unix line endings
 */
export function normalizeLineEndings(text: string): string {
  if (!text) return text;
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Clean and normalize text for display
 * Combines multiple text cleaning operations
 * @param text Raw text to process
 * @returns Cleaned and normalized text
 */
export function cleanText(text: string): string {
  if (!text) return text;
  
  let result = normalizeLineEndings(text);
  result = cleanSignalText(result);
  
  return result;
}

/**
 * Post-process and format a trading signal tweet
 * Ensures consistent formatting regardless of how the LLM generated it
 * 
 * @param text The raw tweet text from LLM
 * @returns Properly formatted tweet text
 */
export function formatSignalTweet(text: string): string {
  if (!text) return text;
  
  // First apply standard cleaning
  let formatted = cleanSignalText(text);
  
  // Ensure proper line breaks after common signal fields
  // This catches cases where everything is on one line
  const fieldPatterns = [
    /(\ud83c\udfaf\s*\$\w+\s+(?:day|swing)\s+trade)\s+(?!\n)/gi,  // 🎯 $SYM day/swing trade
    /(\ud83d\udcc8\s*\$\w+\s+(?:day|swing)\s+trade)\s+(?!\n)/gi,  // 📈 $SYM day/swing trade  
    /(\u23f1\ufe0f?\s*hold:[^\n]+)\s+(?=entry:)/gi,               // ⏱️ hold: X
    /(entry:\s*\$[\d.,]+)\s+(?=target:)/gi,                       // entry: $X.XX
    /(target:\s*\$[\d.,]+\s*\([^)]+\))\s+(?=stop:)/gi,           // target: $X.XX (+X%)
    /(stop:\s*\$[\d.,]+\s*\([^)]+\))\s+(?=r:r:)/gi,              // stop: $X.XX (-X%)
    /(r:r:\s*[\d.:]+)\s+(?=conf:)/gi,                            // r:r: 1:X.X
    /(conf:\s*\d+%)\s+(?=[a-z#])/gi,                             // conf: XX%
  ];
  
  for (const pattern of fieldPatterns) {
    formatted = formatted.replace(pattern, '$1\n');
  }
  
  // Clean up any double newlines created
  formatted = formatted.replace(/\n{2,}/g, '\n');
  
  // Ensure hashtags are on their own line if not already
  formatted = formatted.replace(/([^#\n])(#\w+)/g, '$1\n$2');
  
  // Clean up again
  formatted = formatted.replace(/\n{2,}/g, '\n');
  
  return formatted.trim();
}

/**
 * Post-process and format an intel tweet for better readability
 * Adds line breaks and structure to data-heavy intel tweets
 * 
 * @param text The raw intel tweet text from LLM
 * @returns Properly formatted intel tweet text
 */
export function formatIntelTweet(text: string): string {
  if (!text) return text;
  
  // First apply standard cleaning
  let formatted = cleanSignalText(text);
  
  // If the tweet already has proper line breaks (contains \n), just clean it
  if (formatted.includes('\n')) {
    // Ensure bullet points have proper spacing
    formatted = formatted.replace(/([.!?%])(\s*)(-\s)/g, '$1\n\n$3');
    // Clean up excessive newlines
    formatted = formatted.replace(/\n{3,}/g, '\n\n');
    return formatted.trim();
  }
  
  // Otherwise, try to add structure to wall-of-text intel
  // Look for natural break points
  
  // Add line break before bullet-like patterns (sentences starting with key metrics)
  // Pattern: period/number followed by new metric indicator
  formatted = formatted.replace(/([.!?%])\s+([\w$]+\s+(?:tvl|lending|yields?|pools?|inflows?|wallets?|volume|up|down|\+|-)\s)/gi, '$1\n- $2');
  
  // Add break before prediction/action phrases
  formatted = formatted.replace(/([.!?%])\s+(watch for|expect|could|if\s)/gi, '$1\n\n$2');
  
  // Add break before ticker mentions at end
  formatted = formatted.replace(/([.!?%])\s+(\$[A-Z]+\s+trending)/gi, '$1\n$2');
  
  // Ensure we don't have too many consecutive newlines
  formatted = formatted.replace(/\n{3,}/g, '\n\n');
  
  return formatted.trim();
}
