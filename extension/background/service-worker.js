/**
 * Background Service Worker
 * Handles API calls and context menu
 */

const API_URL = 'http://localhost:3000/api/verify';

// Create context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'verifyClaim',
    title: '🔍 Verify Claim',
    contexts: ['selection']
  });
  
  console.log('🔍 Claim Verifier extension installed');
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'verifyClaim' && info.selectionText) {
    // Send verification request
    verifyClaim(info.selectionText).then((result) => {
      // Send result back to content script
      chrome.tabs.sendMessage(tab.id, {
        action: 'showResult',
        result: result
      });
    });
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'verifyClaim') {
    // Verify the claim
    verifyClaim(request.claim)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({
          error: error.message || 'Verification failed'
        });
      });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

// Verify claim via API
async function verifyClaim(claim) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        claim: claim,
        useWebSearch: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Verification error:', error);
    throw new Error(
      `Failed to verify claim. Make sure the backend server is running at ${API_URL}. Error: ${error.message}`
    );
  }
}

// Store recent verifications (optional, for history feature)
async function storeVerification(claim, result) {
  try {
    const { verifications = [] } = await chrome.storage.local.get('verifications');
    
    verifications.unshift({
      claim: claim,
      result: result,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 50 verifications
    if (verifications.length > 50) {
      verifications.pop();
    }
    
    await chrome.storage.local.set({ verifications });
  } catch (error) {
    console.error('Failed to store verification:', error);
  }
}

console.log('🔍 Claim Verifier service worker loaded');
