document.addEventListener('DOMContentLoaded', () => {
    // --- Get Element References ---
    const header = document.querySelector('header');
    const modelPicker = document.getElementById('model-picker');
    const buttonGroup = document.getElementById('button-group');
    const searchInputGroup = document.getElementById('search-input-group'); // This is the new container for the input field
    const contentArea = document.getElementById('content-area');
    
    const summarizeButton = document.getElementById('summarize-button');
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input'); // The new text input field
    const sendButton = document.getElementById('send-button'); // The new send button

    const loaderEl = document.getElementById('loader');
    const resultEl = document.getElementById('summary-result');
    const errorEl = document.getElementById('error-message');

    // --- Initialize Tools ---
    const converter = new showdown.Converter();
    let selectedModel = 'gpt-3.5-turbo'; // Default model

    // --- Event Listeners ---

    // Model selection logic (this part is already correct)
    modelPicker.addEventListener('click', (event) => {
        const wrapper = event.target.closest('.model-icon-wrapper');
        if (wrapper) {
            modelPicker.querySelectorAll('.model-icon-wrapper').forEach(w => w.classList.remove('active'));
            wrapper.classList.add('active');
            selectedModel = wrapper.dataset.model;
        }
    });

    // "Summarize" button click (main button toggles dropdown handled elsewhere)
    // summarizeButton.addEventListener('click', handleSummarize);

    // "Search" button click -> This now transforms the UI
    searchButton.addEventListener('click', () => {
        buttonGroup.classList.add('hidden');
        searchInputGroup.classList.remove('hidden');
        searchInput.focus(); // Automatically focus the input field for the user
        // Hide dropdown when switching to the search input
        if (summarizeOptions) summarizeOptions.classList.remove('show');
    });

    // "Send" button click -> This triggers the AI search
    sendButton.addEventListener('click', handleSearch);

    // Dropdown options (if present)
    const summarizeOptions = document.getElementById('summarize-options');
    const findKeyBtn = document.getElementById('find-key-info');
    const summarizePageBtn = document.getElementById('summarize-page');
    const analyzeBtn = document.getElementById('analyze-page');

    if (findKeyBtn) findKeyBtn.addEventListener('click', () => { if (summarizeOptions) summarizeOptions.classList.remove('show'); handleKeyInfo(); });
    if (summarizePageBtn) summarizePageBtn.addEventListener('click', () => { if (summarizeOptions) summarizeOptions.classList.remove('show'); handleSummarize(); });
    if (analyzeBtn) analyzeBtn.addEventListener('click', () => { if (summarizeOptions) summarizeOptions.classList.remove('show'); handleAnalyze(); });

    // Toggle behavior for the three-dot summarize button
    if (summarizeButton && summarizeOptions) {
        summarizeButton.addEventListener('click', (e) => {
            e.stopPropagation();
            // Toggle visibility class
            summarizeOptions.classList.toggle('show');
            // Clear any previous inline positioning
            summarizeOptions.style.top = '';
            summarizeOptions.style.bottom = '';

            // After the element becomes visible, compute fixed coordinates so it appears next to the button
            requestAnimationFrame(() => {
                if (!summarizeOptions.classList.contains('show')) return;
                const menuRect = summarizeOptions.getBoundingClientRect();
                const btnRect = summarizeButton.getBoundingClientRect();
                const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
                const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

                // Default align: right edge of menu aligns with right edge of button
                const preferredRight = viewportWidth - (btnRect.right);
                let left = btnRect.right - menuRect.width; // align right edges
                let top = btnRect.bottom + 8; // below button with 8px gap

                // If menu would overflow to the left, clamp to 8px
                if (left < 8) left = 8;

                // If menu would overflow bottom, try positioning above the button
                if ((top + menuRect.height) > (viewportHeight - 8)) {
                    top = btnRect.top - menuRect.height - 8;
                }

                summarizeOptions.style.left = left + 'px';
                summarizeOptions.style.top = top + 'px';
            });
        });

        // Close the dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!summarizeOptions.contains(e.target) && !summarizeButton.contains(e.target)) {
                summarizeOptions.classList.remove('show');
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') summarizeOptions.classList.remove('show');
        });
    }

    // Go-back icon (restore the original two-button view)
    const goBackIcon = document.getElementById('go-back-icon');
    if (goBackIcon) {
        goBackIcon.addEventListener('click', () => {
            // Clear input and restore button group
            if (searchInput) searchInput.value = '';
            searchInputGroup.classList.add('hidden');
            buttonGroup.classList.remove('hidden');
            // Ensure dropdown is hidden when returning
            if (summarizeOptions) summarizeOptions.classList.remove('show');
        });
    }

    // "Enter" key press in the input field also triggers the AI search
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleSearch();
        }
    });

    // --- Handler Functions ---

    function handleSummarize() {
        showLoadingState(); // Hide controls and show spinner
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab.url || activeTab.url.startsWith('chrome://')) {
                showError('Cannot analyze Chrome pages.');
                return;
            }
            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: getPageContent,
            }, (injectionResults) => {
                if (chrome.runtime.lastError || !injectionResults || !injectionResults[0].result) {
                    showError('Could not access page content.');
                    return;
                }
                const pageText = injectionResults[0].result;
                // Send a "getSummary" action to the background
                sendMessageToAI({ action: "getSummary", text: pageText, model: selectedModel });
            });
        });
    }

    // Find key info on the page and highlight it
    function handleKeyInfo() {
        showLoadingState();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab.url || activeTab.url.startsWith('chrome://')) {
                showError('Cannot analyze Chrome pages.');
                return;
            }
            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: getPageContent,
            }, (injectionResults) => {
                if (chrome.runtime.lastError || !injectionResults || !injectionResults[0].result) {
                    showError('Could not access page content.');
                    return;
                }
                const pageText = injectionResults[0].result;
                // Send a "findKeyInfo" action to the background
                sendMessageToAI({ action: "findKeyInfo", text: pageText, model: selectedModel });
            });
        });
    }

    // Analyze page and render flashcards in the popup
    function handleAnalyze() {
        showLoadingState();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (!activeTab.url || activeTab.url.startsWith('chrome://')) {
                showError('Cannot analyze Chrome pages.');
                return;
            }
            chrome.scripting.executeScript({
                target: { tabId: activeTab.id },
                func: getPageContent,
            }, (injectionResults) => {
                if (chrome.runtime.lastError || !injectionResults || !injectionResults[0].result) {
                    showError('Could not access page content.');
                    return;
                }
                const pageText = injectionResults[0].result;
                // Send analyze request
                chrome.runtime.sendMessage({ action: 'analyzePage', text: pageText, model: selectedModel }, (response) => {
                    if (!response || !response.success) {
                        showError(response ? response.error : 'No response from background');
                        return;
                    }

                    // The model is expected to return a JSON array. Try to parse it.
                    let cards = [];
                    try {
                        cards = JSON.parse(response.summary);
                    } catch (e) {
                        // If the model wrapped JSON in backticks or text, try to extract JSON substring
                        const maybe = response.summary.match(/\[\s*\{[\s\S]*\}\s*\]/m);
                        if (maybe) {
                            try { cards = JSON.parse(maybe[0]); } catch (e2) { cards = []; }
                        }
                    }

                    if (!Array.isArray(cards) || cards.length === 0) {
                        showError('Model did not return flashcards in JSON.');
                        return;
                    }

                    renderFlashcards(cards);
                });
            });
        });
    }

    function renderFlashcards(cards) {
        let current = 0;
        // Clear result and build container
        resultEl.innerHTML = '';

    const view = document.createElement('div');
    view.className = 'flashcard-view flashcard-large';

        const wrapper = document.createElement('div');
        wrapper.className = 'card-wrapper';

        // Create card element for a given card object
        function createCardElement(c, index) {
            const card = document.createElement('div');
            card.className = 'flashcard card-enter';
            const inner = document.createElement('div');
            inner.className = 'flashcard-inner';

            const front = document.createElement('div');
            front.className = 'flashcard-face flashcard-front';
            front.innerHTML = `<div><h3>${escapeHtml(c.question || ('Q ' + (index+1)))}</h3></div>`;

            const back = document.createElement('div');
            back.className = 'flashcard-face flashcard-back';
            back.innerHTML = `<div><p>${escapeHtml(c.answer || '')}</p></div>`;

            inner.appendChild(front);
            inner.appendChild(back);
            card.appendChild(inner);

            // Flip on click
            card.addEventListener('click', () => card.classList.toggle('flipped'));

            // Remove enter class after animation completes
            card.addEventListener('animationend', (e) => {
                if (e.animationName === 'cardIn') card.classList.remove('card-enter');
                if (e.animationName === 'cardOut') card.remove();
            });

            return card;
        }

        // Current displayed card element
        let currentCardEl = createCardElement(cards[current], current);
        wrapper.appendChild(currentCardEl);

        // Controls
        const controls = document.createElement('div');
        controls.className = 'flashcard-controls';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn-nav';
        prevBtn.textContent = 'Previous';
        prevBtn.disabled = true;

        const indicator = document.createElement('div');
        indicator.className = 'card-indicator';
        indicator.textContent = `${current+1} / ${cards.length}`;

        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn-nav';
        nextBtn.textContent = 'Next';
        nextBtn.disabled = cards.length <= 1;

        controls.appendChild(prevBtn);
        controls.appendChild(indicator);
        controls.appendChild(nextBtn);

        // Footer with go-back button
        const footer = document.createElement('div');
        footer.className = 'flashcards-footer';
        const backBtn = document.createElement('button');
        backBtn.className = 'flashcards-back-btn';
        backBtn.textContent = 'Go back';
        backBtn.addEventListener('click', () => {
            // Restore original header and controls
            header.classList.remove('hidden');
            modelPicker.classList.remove('hidden');
            buttonGroup.classList.remove('hidden');
            searchInputGroup.classList.add('hidden');
            showContentState('result');
            resultEl.innerHTML = '';
        });
        footer.appendChild(backBtn);

        // Navigation handlers
        function showCard(newIndex, dir) {
            if (newIndex < 0 || newIndex >= cards.length || newIndex === current) return;
            // Animate current out
            currentCardEl.classList.add('card-exit');

            // Create next card and insert
            const nextEl = createCardElement(cards[newIndex], newIndex);
            // start hidden and then let CSS animation run
            wrapper.appendChild(nextEl);

            // Update current references after a short delay to allow exit animation
            setTimeout(() => {
                // Remove old element if still present
                if (currentCardEl && currentCardEl.parentNode) currentCardEl.remove();
                currentCardEl = nextEl;
                current = newIndex;
                prevBtn.disabled = current === 0;
                nextBtn.disabled = current === cards.length - 1;
                indicator.textContent = `${current+1} / ${cards.length}`;
            }, 320); // matches cardOut duration
        }

        prevBtn.addEventListener('click', () => showCard(current - 1, -1));
        nextBtn.addEventListener('click', () => showCard(current + 1, 1));

        // Assemble view
        view.appendChild(wrapper);
        view.appendChild(controls);
        view.appendChild(footer);

        resultEl.appendChild(view);
        showContentState('result');
    }

    function handleSearch() {
        const query = searchInput.value;
        if (!query.trim()) return; // Do nothing if the input is empty

        showLoadingState(); // Hide controls and show spinner
        // Send a "getSearchResponse" action to the background
        sendMessageToAI({ action: "getSearchResponse", query: query, model: selectedModel });
    }

    // --- Helper Functions ---

    // This function centralizes sending messages to the background script
    function sendMessageToAI(message) {
        chrome.runtime.sendMessage(message, (response) => {
            if (!response) {
                showError('No response from background.');
                return;
            }

            if (!response.success) {
                showError(response.error || 'API request failed.');
                return;
            }

            // Special handling for findKeyInfo: parse <HIGHLIGHT> tags and highlight on the page
            if (message.action === 'findKeyInfo') {
                const raw = response.summary || '';
                // Extract all <HIGHLIGHT>...</HIGHLIGHT> occurrences
                const re = /<HIGHLIGHT>([\s\S]*?)<\/HIGHLIGHT>/gi;
                const matches = [];
                let m;
                while ((m = re.exec(raw)) !== null) {
                    const text = m[1].trim();
                    if (text) matches.push(text);
                }

                if (matches.length === 0) {
                    // Nothing to highlight — show the summary area with a message
                    resultEl.innerHTML = '<p><strong>No highlighted excerpts returned by the model.</strong></p>';
                    showContentState('result');
                    return;
                }

                // Show a quick debug list of excerpts in the popup
                const listHtml = '<strong>Highlights:</strong><ul>' + matches.map(t => '<li>' + escapeHtml(t) + '</li>').join('') + '</ul>';
                resultEl.innerHTML = listHtml;
                showContentState('result');

                // Inject a highlighter into the active tab
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const activeTab = tabs[0];
                    if (!activeTab || !activeTab.id) return;

                    chrome.scripting.executeScript({
                        target: { tabId: activeTab.id },
                        func: (excerpts) => {
                            // Helper to escape for RegExp
                            function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

                            // Walk text nodes and replace matches with highlighted spans
                            function walkAndHighlight(root, excerpt) {
                                const lowered = excerpt.toLowerCase();
                                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
                                const nodes = [];
                                while (walker.nextNode()) nodes.push(walker.currentNode);

                                let found = false;
                                for (const node of nodes) {
                                    const text = node.nodeValue;
                                    if (!text) continue;
                                    const idx = text.toLowerCase().indexOf(lowered);
                                    if (idx === -1) continue;

                                    // Split the text node around the match
                                    const before = text.slice(0, idx);
                                    const matchText = text.slice(idx, idx + excerpt.length);
                                    const after = text.slice(idx + excerpt.length);

                                    const span = document.createElement('span');
                                    span.textContent = matchText;
                                    span.style.background = '#fff176'; // yellow-ish
                                    span.style.padding = '2px 2px';
                                    span.style.borderRadius = '3px';
                                    span.className = 'asiste-highlight';

                                    const parent = node.parentNode;
                                    if (!parent) continue;

                                    // Create new nodes
                                    if (before) parent.insertBefore(document.createTextNode(before), node);
                                    parent.insertBefore(span, node);
                                    if (after) parent.insertBefore(document.createTextNode(after), node);
                                    parent.removeChild(node);

                                    found = true;
                                    // Continue searching to highlight other occurrences in other nodes
                                }
                                return found;
                            }

                            // Remove existing highlights (idempotent)
                            const existing = document.querySelectorAll('.asiste-highlight');
                            existing.forEach(n => {
                                const txt = document.createTextNode(n.textContent);
                                n.parentNode.replaceChild(txt, n);
                            });

                            const results = [];
                            for (const ex of excerpts) {
                                try {
                                    const ok = walkAndHighlight(document.body, ex);
                                    results.push({ excerpt: ex, matched: ok });
                                } catch (e) {
                                    results.push({ excerpt: ex, matched: false, error: String(e) });
                                }
                            }

                            // Scroll to first highlighted element
                            const first = document.querySelector('.asiste-highlight');
                            if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });

                            return results;
                        },
                        args: [matches]
                    }, (injectResults) => {
                        // Optionally, we could show injection results in the popup for debugging
                        // console.log('Injection results', injectResults);
                    });
                });
                return;
            }

            // Default behavior: show text result in popup
            resultEl.innerHTML = converter.makeHtml(response.summary || '');
            showContentState('result');
        });
    }

    function escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // This function hides all input controls and shows the loader
    function showLoadingState() {
        header.classList.add('hidden');
        modelPicker.classList.add('hidden');
        buttonGroup.classList.add('hidden');
        searchInputGroup.classList.add('hidden'); // Also hide the search input
        showContentState('loading');
    }

    // This function displays an error message
    function showError(message) {
        errorEl.textContent = message;
        showContentState('error');
    }

    // This function manages which element is visible in the content area
    function showContentState(state) {
        loaderEl.classList.add('hidden');
        resultEl.classList.add('hidden');
        errorEl.classList.add('hidden');

        if (state === 'loading') loaderEl.classList.remove('hidden');
        else if (state === 'result') resultEl.classList.remove('hidden');
        else if (state === 'error') errorEl.classList.remove('hidden');
    }
});

// Function injected into the page (remains the same)
function getPageContent() {
    return document.body.innerText;
}