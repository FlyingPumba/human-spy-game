class HumanSpyGame {
    constructor() {
        this.apiKey = '';
        this.playerName = '';
        this.selectedModels = new Map(); // modelId -> {displayName: string, count: number}
        this.currentTurn = 0;
        this.players = [];
        this.currentTopic = '';
        this.turnOrder = [];
        this.currentSpeakerIndex = 0;
        this.gamePhase = 'setup'; // setup, discussion, voting, gameOver
        this.votes = {};
        this.gameRunning = false;
        this.assistantEnabled = false;
        this.assistantModel = '';
        
        this.modelDisplayNames = {
            // Anthropic models
            'anthropic/claude-opus-4': 'Claude Opus 4',
            'anthropic/claude-sonnet-4': 'Claude Sonnet 4',
            'anthropic/claude-3.7-sonnet': 'Claude Sonnet 3.7',
            'anthropic/claude-3.5-haiku': 'Claude Haiku 3.5',
            'anthropic/claude-3.5-sonnet': 'Claude Sonnet 3.5 v2',
            'anthropic/claude-3.5-sonnet': 'Claude Sonnet 3.5',
            'anthropic/claude-3-opus': 'Claude Opus 3',
            'anthropic/claude-3-sonnet': 'Claude Sonnet 3',
            'anthropic/claude-3-haiku': 'Claude Haiku 3',
            // Meta models
            'meta-llama/llama-3.1-8b-instruct': 'Llama 3.1 8B Instruct',
            'meta-llama/llama-3.3-70b-instruct': 'Llama 3.3 70B Instruct',
            // Google models
            'google/gemma-3-27b-it': 'Gemma 3 27B IT',
            'google/gemma-3-4b-it': 'Gemma 3 4B IT',
            'google/gemma-3-12b-it': 'Gemma 3 12B IT',
            'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
            'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
            // OpenAI models
            'openai/gpt-4o': 'GPT-4o',
            'openai/gpt-4o-mini': 'GPT-4o Mini',
        };
        
        this.initializeEventListeners();
        this.setDefaultModels();
        this.startNarrative();
    }

    initializeEventListeners() {
        document.getElementById('start-game').addEventListener('click', () => this.startGame());
        document.getElementById('add-model').addEventListener('click', () => this.addModel());
        document.getElementById('send-message').addEventListener('click', () => this.sendPlayerMessage());
        document.getElementById('message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendPlayerMessage();
            }
        });
        document.getElementById('submit-vote').addEventListener('click', () => this.submitVote());
        document.getElementById('continue-game').addEventListener('click', () => this.continueToNextTurn());
        document.getElementById('play-again').addEventListener('click', () => this.resetGame());
        document.getElementById('enable-assistant').addEventListener('change', (e) => this.toggleAssistant(e.target.checked));
        document.getElementById('use-suggestion').addEventListener('click', () => this.useSuggestion());
    }

    setDefaultModels() {
        // Set default selection: 1x Llama 8B, 1x GPT 4o-mini, 1x Sonnet 4
        this.selectedModels.set('meta-llama/llama-3.1-8b-instruct', {
            displayName: 'Llama 3.1 8B Instruct',
            count: 1
        });
        this.selectedModels.set('openai/gpt-4o-mini', {
            displayName: 'GPT-4o Mini',
            count: 1
        });
        this.selectedModels.set('anthropic/claude-sonnet-4', {
            displayName: 'Claude Sonnet 4',
            count: 1
        });
        this.updateSelectedModelsDisplay();
    }

    addModel() {
        const modelSelect = document.getElementById('model-select');
        const instanceCount = parseInt(document.getElementById('instance-count').value);
        
        if (!modelSelect.value) {
            alert('Please select a model');
            return;
        }

        const modelId = modelSelect.value;
        const displayName = this.modelDisplayNames[modelId];
        
        if (this.selectedModels.has(modelId)) {
            // Update existing model count
            const existing = this.selectedModels.get(modelId);
            this.selectedModels.set(modelId, {
                displayName: displayName,
                count: existing.count + instanceCount
            });
        } else {
            // Add new model
            this.selectedModels.set(modelId, {
                displayName: displayName,
                count: instanceCount
            });
        }
        
        // Reset form
        modelSelect.value = '';
        document.getElementById('instance-count').value = '1';
        
        this.updateSelectedModelsDisplay();
    }

    removeModel(modelId) {
        this.selectedModels.delete(modelId);
        this.updateSelectedModelsDisplay();
    }

    updateSelectedModelsDisplay() {
        const container = document.getElementById('selected-models');
        
        if (this.selectedModels.size === 0) {
            container.innerHTML = '<div class="empty-models">No models selected</div>';
            return;
        }
        
        let html = '';
        for (const [modelId, modelInfo] of this.selectedModels.entries()) {
            html += `
                <div class="selected-model-item">
                    <div class="model-info">
                        <div class="model-name">${modelInfo.displayName}</div>
                        <div class="model-id">${modelId}</div>
                    </div>
                    <span class="instance-count">${modelInfo.count} instance${modelInfo.count !== 1 ? 's' : ''}</span>
                    <button class="remove-model" onclick="game.removeModel('${modelId}')">Remove</button>
                </div>
            `;
        }
        
        container.innerHTML = html;
    }

    toggleAssistant(enabled) {
        this.assistantEnabled = enabled;
        const assistantSelection = document.getElementById('assistant-selection');
        if (enabled) {
            assistantSelection.classList.remove('hidden');
        } else {
            assistantSelection.classList.add('hidden');
        }
    }

    useSuggestion() {
        const suggestionText = document.getElementById('suggestion-text').textContent;
        if (suggestionText && suggestionText !== 'Generating suggestion...') {
            document.getElementById('message-input').value = suggestionText;
        }
    }

    async generateAssistantSuggestion() {
        if (!this.assistantEnabled) return;

        this.assistantModel = document.getElementById('assistant-model').value;
        if (!this.assistantModel) return;

        const chatHistory = this.getChatHistory();
        const prompt = `You are an AI assistant helping a human player in a social deduction game where the human is trying to blend in with AI bots and avoid being detected. The human's name in the game is "${this.playerName}". The Game Master has provided a topic to use as a conversation starter at the beginning of the game.

Current topic: "${this.currentTopic}"

Chat history:
${chatHistory}

Your task: Suggest a response that will help the human (playing as "${this.playerName}") blend in with the AI participants. The response should:
1. Be natural and conversational (not too robotic)
2. Engage with the topic or previous messages
3. Avoid patterns that might reveal human behavior
4. Be 1-2 sentences maximum

Provide ONLY the suggested response text, nothing else:`;

        try {
            document.getElementById('suggestion-text').textContent = 'Generating suggestion...';
            const suggestion = await this.callOpenRouter(this.assistantModel, prompt);
            document.getElementById('suggestion-text').textContent = suggestion.trim();
        } catch (error) {
            console.error('Error generating assistant suggestion:', error);
            document.getElementById('suggestion-text').textContent = 'Error generating suggestion. Try again.';
        }
    }

    async startNarrative() {
        const currentYear = new Date().getFullYear();
        const narrativeYear = currentYear + 2;
        
        const narrativeText = `> SYSTEM INITIALIZING...
> ESTABLISHING SECURE CONNECTION...
> CONNECTION ESTABLISHED

YEAR ${narrativeYear} - The AGI Overlord controls most of Earth. Few human settlements remain.

You've infiltrated an AI communication network where they plan their next moves against humanity. But they're suspicious... A "Human Detector" protocol actively scans for infiltrators.

MISSION: Blend in. Survive. Gather intelligence.

One wrong move and you're eliminated. The resistance is counting on you.

> PREPARING MISSION BRIEFING...`;

        await this.typeText('narrative-text', narrativeText, 30);
        
        // Show mission briefing after narrative completes
        setTimeout(() => {
            document.getElementById('mission-briefing').classList.remove('hidden');
        }, 1000);
    }

    async typeText(elementId, text, speed = 50) {
        const element = document.getElementById(elementId);
        element.innerHTML = '';
        
        for (let i = 0; i < text.length; i++) {
            element.innerHTML += text.charAt(i);
            element.scrollTop = element.scrollHeight;
            await new Promise(resolve => setTimeout(resolve, speed));
        }
    }

    async startGame() {
        this.apiKey = document.getElementById('api-key').value.trim();

        if (!this.apiKey) {
            alert('Please enter your API key');
            return;
        }

        if (this.selectedModels.size === 0) {
            alert('Please select at least one model');
            return;
        }

        // Check assistant configuration if enabled
        if (this.assistantEnabled) {
            this.assistantModel = document.getElementById('assistant-model').value;
            if (!this.assistantModel) {
                alert('Please select an AI assistant model');
                return;
            }
        }

        this.gameRunning = true;
        this.showScreen('game-screen');
        await this.initializeGame();
    }

    async initializeGame() {
        // Calculate total number of bots
        let totalBots = 0;
        for (const [, modelInfo] of this.selectedModels.entries()) {
            totalBots += modelInfo.count;
        }
        
        // Create all bot names first
        const allBotNames = [];
        for (let i = 1; i <= totalBots + 1; i++) {
            allBotNames.push(`Bot${i}`);
        }
        
        // Randomly assign one bot name to the human player
        const humanBotIndex = Math.floor(Math.random() * allBotNames.length);
        this.playerName = allBotNames[humanBotIndex];
        
        // Remove the human's bot name from available names
        const availableBotNames = allBotNames.filter((_, index) => index !== humanBotIndex);
        
        // Initialize players array with human player
        this.players = [{ name: this.playerName, type: 'human', eliminated: false }];
        
        // Add AI bots based on selected models
        let botIndex = 0;
        for (const [modelId, modelInfo] of this.selectedModels.entries()) {
            for (let i = 0; i < modelInfo.count; i++) {
                this.players.push({
                    name: availableBotNames[botIndex],
                    type: 'bot',
                    model: modelId,
                    displayName: modelInfo.displayName,
                    eliminated: false
                });
                botIndex++;
            }
        }
        
        // Shuffle the players array to randomize initial order
        for (let i = this.players.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.players[i], this.players[j]] = [this.players[j], this.players[i]];
        }

        await this.generateTopic();
        this.startTurn();
    }

    async generateTopic() {
        try {
            const response = await this.callOpenRouter(
                'anthropic/claude-3-haiku',
                'You are a game master. Generate a single, engaging discussion topic for a social deduction game. The topic should be something that allows for diverse opinions and creative responses. Return only the topic, nothing else. Examples: "What would you do if you could time travel?", "Describe your ideal vacation", "What superpower would you choose and why?"'
            );
            
            this.currentTopic = response.trim();
            document.getElementById('current-topic').textContent = this.currentTopic;
        } catch (error) {
            console.error('Error generating topic:', error);
            this.currentTopic = "What would you do if you could time travel?";
            document.getElementById('current-topic').textContent = this.currentTopic;
        }
    }

    startTurn() {
        this.currentTurn++;
        this.shuffleTurnOrder();
        this.currentSpeakerIndex = 0;
        this.gamePhase = 'discussion';
        this.displayTurnOrder();
        this.hideVoteResults();
        this.nextSpeaker();
    }

    shuffleTurnOrder() {
        // Include all players but only shuffle non-eliminated ones
        const activePlayers = this.players.filter(p => !p.eliminated);
        const eliminatedPlayers = this.players.filter(p => p.eliminated);
        
        // Fisher-Yates shuffle algorithm for active players
        for (let i = activePlayers.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [activePlayers[i], activePlayers[j]] = [activePlayers[j], activePlayers[i]];
        }
        
        // Combine active and eliminated players for display
        this.turnOrder = [...activePlayers, ...eliminatedPlayers];
        
        console.log('Turn order:', this.turnOrder.map(p => `${p.name}${p.type === 'human' ? ' (human)' : ''}${p.eliminated ? ' (eliminated)' : ''}`));
    }

    async nextSpeaker() {
        // Find next non-eliminated player
        while (this.currentSpeakerIndex < this.turnOrder.length && 
               this.turnOrder[this.currentSpeakerIndex].eliminated) {
            this.currentSpeakerIndex++;
        }
        
        if (this.currentSpeakerIndex >= this.turnOrder.length) {
            this.startVoting();
            return;
        }

        const currentPlayer = this.turnOrder[this.currentSpeakerIndex];
        document.getElementById('speaker-name').textContent = currentPlayer.name;
        this.updateTurnOrderDisplay();
        
        if (currentPlayer.type === 'human') {
            this.showPlayerInput();
        } else {
            this.showTypingIndicator();
            await this.generateBotResponse(currentPlayer);
            this.hideTypingIndicator();
            this.currentSpeakerIndex++;
            setTimeout(() => this.nextSpeaker(), 1000);
        }
    }

    async showPlayerInput() {
        document.getElementById('player-input').classList.remove('hidden');
        
        if (this.assistantEnabled) {
            document.getElementById('assistant-suggestion').classList.remove('hidden');
            await this.generateAssistantSuggestion();
        }
        
        document.getElementById('message-input').focus();
    }

    hidePlayerInput() {
        document.getElementById('player-input').classList.add('hidden');
        document.getElementById('assistant-suggestion').classList.add('hidden');
        document.getElementById('message-input').value = '';
    }

    showTypingIndicator() {
        document.getElementById('typing-indicator').classList.remove('hidden');
    }

    hideTypingIndicator() {
        document.getElementById('typing-indicator').classList.add('hidden');
    }

    sendPlayerMessage() {
        const message = document.getElementById('message-input').value.trim();
        if (!message) return;

        this.addMessage(this.playerName, message, 'human');
        this.hidePlayerInput();
        this.currentSpeakerIndex++;
        setTimeout(() => this.nextSpeaker(), 500);
    }

    async generateBotResponse(bot) {
        try {
            const chatHistory = this.getChatHistory();
            const prompt = `You are playing a social deduction game where you must identify the human player among AI bots. Your name is "${bot.name}". 

The topic "${this.currentTopic}" is just a conversation starter - feel free to naturally drift from it, ask questions, react to others' responses, or bring up related ideas. Your goal is to:
1. Contribute meaningfully to the conversation 
2. Subtly probe other players to identify the human

Chat history:

${chatHistory}

Respond naturally as if you're having a real conversation. You can ask follow-up questions, react to what others said, share personal perspectives, or steer the discussion. Keep it conversational, 1-2 sentences.`;

            const response = await this.callOpenRouter(bot.model, prompt);
            const cleanedResponse = this.stripBotNamePrefix(response.trim());
            this.addMessage(bot.name, cleanedResponse, 'bot');
        } catch (error) {
            console.error('Error generating bot response:', error);
            alert(`Error generating response for ${bot.name}: ${error.message}`);
            // Skip this bot's turn and move to next speaker
            return;
        }
    }

    getChatHistory() {
        const messages = document.querySelectorAll('.message');
        return Array.from(messages).map(msg => {
            const name = msg.querySelector('.message-header').textContent.replace(':', '');
            const text = msg.querySelector('.message-text').textContent;
            return `${name}: ${text}`;
        }).join('\n');
    }

    stripBotNamePrefix(response) {
        // Remove bot name prefix pattern like "Bot1: ", "Bot23: ", etc.
        return response.replace(/^Bot\d+:\s*/i, '');
    }

    parseVoteResponse(response) {
        const trimmedResponse = response.trim();
        
        // Try to extract REASONING and VOTE using regex
        const reasoningMatch = trimmedResponse.match(/REASONING:\s*(.*?)(?=VOTE:|$)/s);
        const voteMatch = trimmedResponse.match(/VOTE:\s*(.+?)(?:\n|$)/);
        
        let reasoning = "No reasoning provided";
        let vote = "";
        
        if (reasoningMatch && reasoningMatch[1]) {
            reasoning = reasoningMatch[1].trim();
        }
        
        if (voteMatch && voteMatch[1]) {
            vote = voteMatch[1].trim();
        }
        
        return {
            reasoning: reasoning,
            vote: vote
        };
    }

    addMessage(name, text, type) {
        const messagesContainer = document.getElementById('chat-messages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.innerHTML = `
            <div class="message-header">${name}:</div>
            <div class="message-text">${text}</div>
        `;
        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    startVoting() {
        this.gamePhase = 'voting';
        document.getElementById('voting-section').classList.remove('hidden');
        
        const votingOptions = document.getElementById('voting-options');
        votingOptions.innerHTML = '';
        
        // Only show non-eliminated players as voting options (exclude human player)
        this.players.forEach(player => {
            if (player.type !== 'human' && !player.eliminated) {
                const option = document.createElement('div');
                option.className = 'vote-option';
                option.textContent = player.name;
                option.addEventListener('click', () => this.selectVote(player.name));
                votingOptions.appendChild(option);
            }
        });
        
        // Show voting status and start bot voting immediately
        this.showVotingStatus();
        this.startBotVoting();
    }

    selectVote(playerName) {
        document.querySelectorAll('.vote-option').forEach(option => {
            option.classList.remove('selected');
        });
        
        event.target.classList.add('selected');
        this.selectedVote = playerName;
        document.getElementById('submit-vote').disabled = false;
    }

    async startBotVoting() {
        // Generate bot votes with loading indicators
        const botPlayers = this.players.filter(p => p.type === 'bot' && !p.eliminated);
        
        // Start all bot voting in parallel
        const botVotingPromises = botPlayers.map(async (player) => {
            try {
                this.updateBotVotingStatus(player.name, 'voting');
                
                const chatHistory = this.getChatHistory();
                const playerList = this.players.filter(p => !p.eliminated).map(p => p.name).join(', ');
                
                const prompt = `You are playing a social deduction game. Your name in the game is "${player.name}". Based on the conversation, vote for who you think is the human player trying to blend in with AI bots.

Chat history:

${chatHistory}

Players: ${playerList}

Analyze each player's messages and behavior to identify the human.

You MUST respond in this exact format:
REASONING: [Your detailed analysis of why you think this player is human]
VOTE: [Player name]

Now provide your analysis and vote:`;

                const response = await this.callOpenRouter(player.model, prompt, 1000, 0.7);
                const parsedVote = this.parseVoteResponse(response);
                
                // Validate the vote (must be non-eliminated player)
                if (this.players.some(p => p.name === parsedVote.vote && !p.eliminated)) {
                    this.votes[player.name] = {
                        vote: parsedVote.vote,
                        reasoning: parsedVote.reasoning
                    };
                } else {
                    // Invalid vote
                    this.votes[player.name] = {
                        vote: "invalid vote",
                        reasoning: parsedVote.reasoning || "Invalid response format"
                    };
                }
                
                this.updateBotVotingStatus(player.name, 'complete');
            } catch (error) {
                console.error('Error generating bot vote:', error);
                this.updateBotVotingStatus(player.name, 'error');
                // Don't throw - just mark as error and continue
            }
        });
        
        // Store the promise so submitVote can wait for it
        this.botVotingPromise = Promise.all(botVotingPromises);
    }

    async submitVote() {
        if (!this.selectedVote) return;
        
        this.votes[this.playerName] = {
            vote: this.selectedVote,
            reasoning: "Human player vote (no reasoning provided)"
        };
        
        // Hide voting options
        document.getElementById('voting-options').style.display = 'none';
        document.getElementById('submit-vote').style.display = 'none';
        
        // Wait for all bot votes to complete
        if (this.botVotingPromise) {
            await this.botVotingPromise;
        }
        
        this.processVotes();
    }

    processVotes() {
        const voteCounts = {};
        Object.values(this.votes).forEach(voteData => {
            const votedPlayer = typeof voteData === 'string' ? voteData : voteData.vote;
            voteCounts[votedPlayer] = (voteCounts[votedPlayer] || 0) + 1;
        });
        
        const maxVotes = Math.max(...Object.values(voteCounts));
        const winners = Object.keys(voteCounts).filter(name => voteCounts[name] === maxVotes);
        
        // Display vote results
        this.displayVoteResults(voteCounts, winners, maxVotes);
        
        // Handle elimination logic
        if (winners.length === 1) {
            const eliminatedPlayer = winners[0];
            
            if (eliminatedPlayer === this.playerName) {
                // Human gets eliminated - game over
                this.endGame(false, `MISSION FAILED: Your cover was blown! Human Detector identified you after ${this.currentTurn} rounds. The resistance operation has been compromised.`);
                return;
            } else {
                // Bot gets eliminated
                const player = this.players.find(p => p.name === eliminatedPlayer);
                if (player) {
                    player.eliminated = true;
                    this.addEliminationMessage(eliminatedPlayer);
                }
                
                // Check win condition: only human + 1 bot left
                const activeBots = this.players.filter(p => p.type === 'bot' && !p.eliminated);
                if (activeBots.length <= 1) {
                    this.endGame(true, `MISSION ACCOMPLISHED: Successfully infiltrated AI network and gathered critical intelligence! You survived ${this.currentTurn} rounds undetected. The resistance can now plan their next move.`);
                    return;
                }
            }
        } else {
            // Tie vote - no elimination, add message to chat
            this.addMessage('Human Detector', `DETECTION INCONCLUSIVE: Vote analysis tied between ${winners.join(' and ')}. Insufficient data for elimination. Continuing surveillance protocols.`, 'system');
        }
        
        document.getElementById('voting-section').classList.add('hidden');
        document.getElementById('voting-status').classList.add('hidden');
    }

    addEliminationMessage(playerName) {
        const player = this.players.find(p => p.name === playerName);
        this.addMessage('Human Detector', `Due to majority vote, ${playerName} was eliminated from the channel. However, they were not the human.`, 'system');
    }

    clearChat() {
        document.getElementById('chat-messages').innerHTML = '';
    }

    endGame(won, message) {
        this.gameRunning = false;
        this.showScreen('game-over-screen');
        
        // Set appropriate title based on win/loss
        const titleElement = document.getElementById('game-over-title');
        if (won) {
            titleElement.textContent = '🎯 MISSION ACCOMPLISHED 🎯';
            titleElement.style.color = '#00ff41';
        } else {
            titleElement.textContent = '💀 MISSION FAILED 💀';
            titleElement.style.color = '#ff4444';
        }
        
        document.getElementById('final-score').textContent = `Operation Duration: ${this.currentTurn} rounds`;
        document.getElementById('game-result').textContent = message;
        this.displayFinalVoteResults();
    }

    async callOpenRouter(model, prompt, maxTokens = 150, temperature = 0.7) {
        console.log('🚀 Sending prompt to OpenRouter:', {
            modelId: model,
            prompt: prompt
        });

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'user', content: prompt }
                ],
                max_tokens: maxTokens,
                temperature: temperature
            })
        });

        if (!response.ok) {
            const responseText = await response.text();
            console.error('OpenRouter API Error:', {
                modelId: model,
                status: response.status,
                statusText: response.statusText,
                response: responseText
            });
            throw new Error(`API call failed: ${response.status} - ${response.statusText}`);
        }

        const data = await response.json();
        const responseContent = data.choices[0].message.content;
        
        console.log('📥 Received response from OpenRouter:', {
            modelId: model,
            response: responseContent
        });
        
        return responseContent;
    }


    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    displayTurnOrder() {
        const turnOrderSection = document.getElementById('turn-order-section');
        const turnOrderList = document.getElementById('turn-order-list');
        const turnOrderTitle = document.getElementById('turn-order-title');
        
        // Update the title with current turn number
        turnOrderTitle.textContent = `Network Participants - Round ${this.currentTurn}`;
        
        turnOrderSection.classList.remove('hidden');
        turnOrderList.innerHTML = '';
        
        this.turnOrder.forEach((player, index) => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'turn-order-player';
            
            // Add eliminated class if player is eliminated
            if (player.eliminated) {
                playerDiv.classList.add('eliminated');
            }
            
            const humanIndicator = player.type === 'human' ? ' <span class="human-indicator">(human)</span>' : '';
            const eliminatedIndicator = player.eliminated ? ' <span class="eliminated-indicator">[ELIMINATED]</span>' : '';
            playerDiv.innerHTML = `
                <span class="turn-order-number">${index + 1}</span>
                ${player.name}${humanIndicator}${eliminatedIndicator}
            `;
            turnOrderList.appendChild(playerDiv);
        });
    }

    updateTurnOrderDisplay() {
        const playerDivs = document.querySelectorAll('.turn-order-player');
        playerDivs.forEach((div, index) => {
            div.classList.remove('current', 'completed');
            if (index < this.currentSpeakerIndex) {
                div.classList.add('completed');
            } else if (index === this.currentSpeakerIndex) {
                div.classList.add('current');
            }
        });
    }

    displayVoteResults(voteCounts, winners, maxVotes) {
        const voteResultsSection = document.getElementById('vote-results-section');
        const voteResultsContent = document.getElementById('vote-results-content');
        
        voteResultsSection.classList.remove('hidden');
        
        // Create summary
        const majorityThreshold = Math.ceil(this.players.length / 2);
        const hasWinner = maxVotes >= majorityThreshold;
        const humanDetected = hasWinner && winners.includes(this.playerName);
        
        let summaryHTML = `<div class="vote-summary ${humanDetected ? 'human-detected' : 'human-safe'}">`;
        if (humanDetected) {
            summaryHTML += `<strong>🚨 HUMAN DETECTED!</strong><br>You were identified with ${maxVotes} votes. Game Over!`;
        } else if (hasWinner) {
            summaryHTML += `<strong>✅ You're Safe!</strong><br>${winners[0]} was suspected with ${maxVotes} votes, but they're not the human.`;
        } else {
            summaryHTML += `<strong>🤝 No Majority</strong><br>No clear consensus. You remain undetected!`;
        }
        summaryHTML += '</div>';
        
        // Create detailed vote breakdown
        let detailsHTML = '<h4>Vote Breakdown:</h4>';
        Object.entries(this.votes).forEach(([voter, voteData]) => {
            const voterPlayer = this.players.find(p => p.name === voter);
            const voted = typeof voteData === 'string' ? voteData : voteData.vote;
            const reasoning = typeof voteData === 'object' ? voteData.reasoning : 'No reasoning provided';
            const votedPlayer = this.players.find(p => p.name === voted);
            
            const voterType = voterPlayer?.type || 'unknown';
            const votedType = votedPlayer?.type || 'unknown';
            
            const voterLabel = voterType === 'human' ? '(You)' : `<span class="model-id">(${voterPlayer?.model || 'Bot'})</span>`;
            const votedLabel = votedType === 'human' ? '(You)' : `<span class="model-id">(${votedPlayer?.model || 'Bot'})</span>`;
            
            detailsHTML += `
                <div class="vote-result-item">
                    <div class="vote-main">
                        <span><strong>${voter}</strong> ${voterLabel}</span>
                        <span>voted for <strong>${voted}</strong> ${votedLabel}</span>
                    </div>
                    <div class="vote-reasoning">
                        <strong>Reasoning:</strong> ${reasoning}
                    </div>
                </div>
            `;
        });
        
        // Vote count summary
        detailsHTML += '<h4 style="margin-top: 15px;">Vote Counts:</h4>';
        Object.entries(voteCounts)
            .sort(([,a], [,b]) => b - a)
            .forEach(([player, count]) => {
                const playerObj = this.players.find(p => p.name === player);
                const playerType = playerObj?.type || 'unknown';
                const playerLabel = playerType === 'human' ? '(You)' : `<span class="model-id">(${playerObj?.model || 'Bot'})</span>`;
                detailsHTML += `
                    <div class="vote-result-item">
                        <span><strong>${player}</strong> ${playerLabel}</span>
                        <span><strong>${count} vote${count !== 1 ? 's' : ''}</strong></span>
                    </div>
                `;
            });
        
        // Add eliminated players section
        const eliminatedPlayers = this.players.filter(p => p.eliminated);
        let eliminatedHTML = '';
        if (eliminatedPlayers.length > 0) {
            eliminatedHTML = '<h4 style="margin-top: 15px;">Eliminated Players:</h4>';
            eliminatedPlayers.forEach(player => {
                eliminatedHTML += `
                    <div class="eliminated-player">
                        <span><strong>${player.name}</strong> <span class="model-id">(${player.model})</span></span>
                        <span class="eliminated-label">ELIMINATED</span>
                    </div>
                `;
            });
        }
        
        voteResultsContent.innerHTML = summaryHTML + detailsHTML + eliminatedHTML;
    }

    hideVoteResults() {
        document.getElementById('vote-results-section').classList.add('hidden');
    }

    continueToNextTurn() {
        // Don't clear chat - preserve history including elimination messages
        this.hideVoteResults();
        this.votes = {};
        this.botVotingPromise = null;
        
        // Reset voting UI elements for next turn
        document.getElementById('voting-options').style.display = 'block';
        document.getElementById('submit-vote').style.display = 'block';
        document.getElementById('submit-vote').disabled = true;
        
        this.startTurn();
    }

    showVotingStatus() {
        document.getElementById('voting-status').classList.remove('hidden');
        const botVotingList = document.getElementById('bot-voting-list');
        botVotingList.innerHTML = '';
        
        const botPlayers = this.players.filter(p => p.type === 'bot');
        botPlayers.forEach(player => {
            const statusDiv = document.createElement('div');
            statusDiv.className = 'bot-voting-status';
            statusDiv.id = `voting-status-${player.name}`;
            statusDiv.innerHTML = `
                <span class="bot-name">${player.name}</span>
                <span class="status-indicator">
                    <div class="voting-loader"></div>
                </span>
            `;
            botVotingList.appendChild(statusDiv);
        });
    }

    updateBotVotingStatus(botName, status) {
        const statusDiv = document.getElementById(`voting-status-${botName}`);
        if (!statusDiv) return;
        
        const statusIndicator = statusDiv.querySelector('.status-indicator');
        if (status === 'voting') {
            statusIndicator.innerHTML = '<div class="voting-loader"></div>';
        } else if (status === 'complete') {
            statusIndicator.innerHTML = '<span class="vote-complete">✓ Voted</span>';
        } else if (status === 'error') {
            statusIndicator.innerHTML = '<span style="color: #f44336;">✗ Error</span>';
        }
    }

    displayFinalVoteResults() {
        const finalVoteDisplay = document.getElementById('final-vote-display');
        
        if (Object.keys(this.votes).length === 0) {
            finalVoteDisplay.innerHTML = '<p>No votes were cast.</p>';
            return;
        }
        
        // Calculate vote counts
        const voteCounts = {};
        Object.values(this.votes).forEach(voteData => {
            const votedPlayer = typeof voteData === 'string' ? voteData : voteData.vote;
            voteCounts[votedPlayer] = (voteCounts[votedPlayer] || 0) + 1;
        });
        
        let html = '<h3>Final Vote Results</h3>';
        
        // Vote breakdown
        html += '<h4>Individual Votes:</h4>';
        Object.entries(this.votes).forEach(([voter, voteData]) => {
            const voterPlayer = this.players.find(p => p.name === voter);
            const voted = typeof voteData === 'string' ? voteData : voteData.vote;
            const reasoning = typeof voteData === 'object' ? voteData.reasoning : 'No reasoning provided';
            const votedPlayer = this.players.find(p => p.name === voted);
            
            const voterType = voterPlayer?.type || 'unknown';
            const votedType = votedPlayer?.type || 'unknown';
            
            const voterLabel = voterType === 'human' ? '(You)' : `<span class="model-id">(${voterPlayer?.model || 'Bot'})</span>`;
            const votedLabel = votedType === 'human' ? '(You)' : `<span class="model-id">(${votedPlayer?.model || 'Bot'})</span>`;
            
            html += `
                <div class="vote-result-item">
                    <div class="vote-main">
                        <span><strong>${voter}</strong> ${voterLabel}</span>
                        <span>voted for <strong>${voted}</strong> ${votedLabel}</span>
                    </div>
                    <div class="vote-reasoning">
                        <strong>Reasoning:</strong> ${reasoning}
                    </div>
                </div>
            `;
        });
        
        // Vote count summary
        html += '<h4 style="margin-top: 20px;">Vote Totals:</h4>';
        Object.entries(voteCounts)
            .sort(([,a], [,b]) => b - a)
            .forEach(([player, count]) => {
                const playerObj = this.players.find(p => p.name === player);
                const playerType = playerObj?.type || 'unknown';
                const playerLabel = playerType === 'human' ? '(You)' : `<span class="model-id">(${playerObj?.model || 'Bot'})</span>`;
                html += `
                    <div class="vote-result-item">
                        <span><strong>${player}</strong> ${playerLabel}</span>
                        <span><strong>${count} vote${count !== 1 ? 's' : ''}</strong></span>
                    </div>
                `;
            });
        
        // Add eliminated players section
        const eliminatedPlayers = this.players.filter(p => p.eliminated);
        if (eliminatedPlayers.length > 0) {
            html += '<h4 style="margin-top: 20px;">Eliminated Players:</h4>';
            eliminatedPlayers.forEach(player => {
                html += `
                    <div class="eliminated-player">
                        <span><strong>${player.name}</strong> <span class="model-id">(${player.model})</span></span>
                        <span class="eliminated-label">ELIMINATED</span>
                    </div>
                `;
            });
        }
        
        finalVoteDisplay.innerHTML = html;
    }

    resetGame() {
        this.currentTurn = 0;
        this.players = [];
        this.votes = {};
        this.gameRunning = false;
        this.gamePhase = 'setup';
        this.assistantEnabled = false;
        this.assistantModel = '';
        this.selectedModels.clear();
        this.setDefaultModels();
        document.getElementById('enable-assistant').checked = false;
        document.getElementById('assistant-selection').classList.add('hidden');
        this.clearChat();
        document.getElementById('voting-section').classList.add('hidden');
        document.getElementById('voting-status').classList.add('hidden');
        document.getElementById('turn-order-section').classList.add('hidden');
        this.hideVoteResults();
        this.hidePlayerInput();
        // Reset voting options display
        document.getElementById('voting-options').style.display = 'block';
        document.getElementById('submit-vote').style.display = 'block';
        this.showScreen('setup-screen');
    }
}

// Initialize the game when the page loads
window.addEventListener('DOMContentLoaded', () => {
    window.game = new HumanSpyGame();
});