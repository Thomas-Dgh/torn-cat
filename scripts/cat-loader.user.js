// ==UserScript==
// @name         C.A.T - Combat Assistance Toolkit
// @namespace    http://tampermonkey.net/
// @version      5.1.4
// @description  Target calling system for faction wars - VPS Hosted
// @author       JESUUS [2353554] 
// @copyright    2025, JESUUS - All rights reserved
// @match        https://www.torn.com/factions.php?step=profile&ID=*
// @match        https://www.torn.com/factions.php?step=your*
// @icon         https://www.google.com/s2/favicons?domain=torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @license      Proprietary - No modifications allowed
// @grant        unsafeWindow
// @connect      *.supabase.co
// @connect      wdgvdggkhxeugyusaymo.supabase.co
// @connect      api.torn.com
// @connect      www.lol-manager.com
// @connect      cat-script.duckdns.org
// @connect      *.duckdns.org
// @connect      cat-script.ovh
// @connect      51.178.26.139
// @connect      www.torn.com
// @run-at       document-start
// ==/UserScript==

/*
 * IMPORTANT NOTICE - PROPRIETARY SOFTWARE
 *
 * This script is the property of JESUUS [2353554] and Fluffy Kittens Development.
 * Unauthorized modification, distribution, or reverse engineering of this code
 * is strictly prohibited.
 *
 * While this script is distributed under MIT license for use, any modifications
 * must be approved by the original author.
 *
 * For permissions or inquiries, contact JESUUS [2353554] in-game.
 */

(function() {
    'use strict';    
    function shouldScriptRun() {
        const url = window.location.href;
        
        if (url.includes('step=profile&ID=')) {
            return true;
        }
        // Only allow specific faction pages
        if (url.includes('step=your')) {
            // Allow main faction page (no type parameter)
            if (!url.includes('type=')) {
                return true;
            }
            // Allow only war page (type=1)
            if (url.includes('type=1')) {
                return true;
            }
            // Block all other faction pages (type=5, type=12, etc.)
            return false;
        }
        
        return false;
    }
    
    
    if (!shouldScriptRun()) {
        return;
    }
    
    try {
        unsafeWindow.GM_xmlhttpRequest = GM_xmlhttpRequest;
        unsafeWindow.GM_getValue = GM_getValue;
        unsafeWindow.GM_setValue = GM_setValue;
        unsafeWindow.unsafeWindow = unsafeWindow;
    } catch (error) {
        console.warn('📡 [CAT DEBUG] UnsafeWindow setup failed:', error);
    }
    
    
    
    // Detect environment (TornPDA vs Tampermonkey)
    if (typeof customFetch !== 'undefined') {
        loadScriptWithCustomFetch();
    } else if (typeof GM_xmlhttpRequest !== 'undefined') {
        loadScriptWithGM();
    } else {
        console.error('📡 [CAT DEBUG] No request method available');
    }
    
    function loadScriptWithCustomFetch() {
        customFetch('http://51.178.26.139:8444/static/cat-main.js?v=' + Date.now(), {
            method: 'GET'
        }).then(response => {
            if (response.ok) {
                return response.text();
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        }).then(scriptContent => {
            try {
                eval(scriptContent);
            } catch (error) {
                console.error('📡 [CAT DEBUG] Error executing server script:', error);
            }
        }).catch(error => {
            console.error('📡 [CAT DEBUG] CustomFetch request failed:', error);
        });
    }
    
    function loadScriptWithGM() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'http://51.178.26.139:8444/static/cat-main.js?v=' + Date.now(),
            timeout: 20000,
            onload: (response) => {
                if (response.status === 200) {
                    try {
                        eval(response.responseText);
                    } catch (error) {
                        console.error('📡 [CAT DEBUG] Error executing server script:', error);
                    }
                } else {
                    console.error('📡 [CAT DEBUG] GM returned status:', response.status);
                    console.error('📡 [CAT DEBUG] GM response text:', response.responseText);
                }
            },
            onerror: (error) => {
                console.error('📡 [CAT DEBUG] GM request failed:', error);
            },
            ontimeout: () => {
                console.error('📡 [CAT DEBUG] GM request timed out');
            }
        });
    }
})();