/**
 * Content script for Roll20 dice integration
 * Handles sending dice roll results to Roll20 chat
 */

interface DiceRollMessage {
  type: 'diceRoll';
  dieId?: string;
  face: number;
  dieType: string;
  rollMessage?: string;
}

/**
 * Inject a dice roll command into the Roll20 chat textarea and submit
 */
async function injectRollCommand(rollMessage: string): Promise<boolean> {
  // Try multiple selector patterns for different Roll20 versions

  // First, try to find contenteditable chat input (modern Roll20)
  const contentEditables = document.querySelectorAll('[contenteditable="true"]');
  let chatInput: HTMLElement | null = null;

  if (contentEditables.length > 0) {
    // Look for the one in the chat input area
    for (const elem of contentEditables) {
      const parent = elem.closest('[title*="chat" i], [class*="input" i], [id*="chat" i]');
      if (parent) {
        chatInput = elem as HTMLElement;
        break;
      }
    }
    // If no parent match, use the last contenteditable (often the chat input)
    if (!chatInput && contentEditables.length > 0) {
      chatInput = contentEditables[contentEditables.length - 1] as HTMLElement;
    }
  }

  // Fallback: Try traditional textarea selectors
  if (!chatInput) {
    const selectors = [
      'textarea[name="message"]',
      'textarea.chat-input',
      'textarea[placeholder*="message"]',
      '#chat textarea',
      'textarea[data-bind*="message"]'
    ];

    for (const selector of selectors) {
      const found = document.querySelector(selector) as HTMLTextAreaElement;
      if (found) {
        chatInput = found;
        console.log(`[Pixels Roll20] Found textarea with selector: ${selector}`);
        break;
      }
    }
  }

  if (!chatInput) {
    // Log page structure for debugging
    console.warn('[Pixels Roll20] Chat input not found');
    return false;
  }

  try {
    // 1. Focus first to trigger framework listeners
    chatInput.focus();

    // 2. Handle Textarea (Priority)
    if (chatInput.tagName === 'TEXTAREA') {
      const textarea = chatInput as HTMLTextAreaElement;
      
      // Clear and set value
      textarea.value = rollMessage;
      
      // Dispatch events in the order frameworks expect
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Wait a tiny bit for Roll20/React to process the input
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send Enter
      sendEnterKey(textarea);
      
      console.log(`[Pixels Roll20] Sent roll command to textarea: ${rollMessage}`);
      return true;
    }

    // 3. Handle ContentEditable (Modern Roll20 / VTTES)
    if (chatInput.contentEditable === 'true') {
      // Clear existing content
      chatInput.innerHTML = '';
      
      // Use execCommand to insert text - framework state compatibility
      const successful = document.execCommand('insertText', false, rollMessage);
      
      if (!successful) {
        chatInput.textContent = rollMessage;
      }

      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Wait a tiny bit
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send Enter
      sendEnterKey(chatInput);

      console.log(`[Pixels Roll20] Sent roll command to contenteditable: ${rollMessage}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error('[Pixels Roll20] Error injecting roll command:', error);
    return false;
  }
}

/**
 * Helper to reliably simulate the Enter key
 */
function sendEnterKey(element: HTMLElement): void {
  const options = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  };
  
  element.dispatchEvent(new KeyboardEvent('keydown', options));
  element.dispatchEvent(new KeyboardEvent('keypress', options));
  element.dispatchEvent(new KeyboardEvent('keyup', options));
}

// Serialize injections so simultaneous rolls submit one at a time instead of clobbering the shared chat input.
let injectionQueue: Promise<unknown> = Promise.resolve();

function enqueueRollCommand(rollMessage: string): Promise<boolean> {
  const result = injectionQueue.then(async () => {
    const success = await injectRollCommand(rollMessage);
    await new Promise(resolve => setTimeout(resolve, 150)); // gap so Roll20 finishes this submit first
    return success;
  });
  injectionQueue = result.catch(() => undefined); // keep the chain alive if one injection rejects
  return result;
}

// Listen for dice roll messages from the background service worker
chrome.runtime.onMessage.addListener((
  message: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) => {
  const isRollMessage = (msg: unknown): msg is DiceRollMessage => {
    return typeof msg === 'object' &&
      msg !== null &&
      (msg as any).type === 'diceRoll' &&
      typeof (msg as any).rollMessage === 'string';
  };

  if (isRollMessage(message)) {
    enqueueRollCommand(message.rollMessage || `/roll ${message.face}`).then(success => {
      sendResponse({ success });
    });
    return true; // Keep channel open for async response
  } else {
    sendResponse({ success: false });
    return false;
  }
});
