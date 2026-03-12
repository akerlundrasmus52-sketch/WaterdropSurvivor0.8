// Stat Cards System - Slot machine style permanent stat upgrades
// Inspired by "Project Clean Earth" mechanics

(function() {
    'use strict';

    // Configuration
    const CARD_COUNT = 16;
    const BASE_COST = 5;
    const COST_MULTIPLIER = 1.3;
    const ANIMATION_DURATION = 3000; // 3 seconds for slot machine animation
    const JUMP_INTERVAL_START = 150; // Start jumping every 150ms
    const JUMP_INTERVAL_END = 500; // End jumping every 500ms
    const FLASH_SPEED_START = 300; // Start flash every 300ms
    const FLASH_SPEED_END = 100; // End flash every 100ms

    // Available stat upgrades
    const STAT_TYPES = [
        { id: 'maxHp', name: 'Max HP', icon: '❤️', color: '#ff4444', baseValue: 20 },
        { id: 'hpRegen', name: 'HP Regen', icon: '💚', color: '#44ff44', baseValue: 1 },
        { id: 'damage', name: 'Damage', icon: '⚔️', color: '#ff8800', baseValue: 5 },
        { id: 'attackSpeed', name: 'Attack Speed', icon: '⚡', color: '#ffff00', baseValue: 0.05 },
        { id: 'armor', name: 'Armor', icon: '🛡️', color: '#8888ff', baseValue: 2 },
        { id: 'damageReduction', name: 'Damage Reduction', icon: '🔰', color: '#4488ff', baseValue: 0.02 },
        { id: 'critChance', name: 'Crit Chance', icon: '💥', color: '#ff00ff', baseValue: 0.03 },
        { id: 'critDamage', name: 'Crit Damage', icon: '💢', color: '#ff0088', baseValue: 0.1 },
        { id: 'lifeSteal', name: 'Life Steal', icon: '🩸', color: '#cc0000', baseValue: 0.02 },
        { id: 'moveSpeed', name: 'Move Speed', icon: '👟', color: '#00ffff', baseValue: 0.03 },
        { id: 'companionDamage', name: 'Companion Damage', icon: '🐺', color: '#aa88ff', baseValue: 3 },
        { id: 'cooldownReduction', name: 'Cooldown Reduction', icon: '⏱️', color: '#88ffff', baseValue: 0.02 },
        { id: 'projectileSpeed', name: 'Projectile Speed', icon: '🎯', color: '#ffaa00', baseValue: 0.05 },
        { id: 'pickupRange', name: 'Pickup Range', icon: '🧲', color: '#ff88ff', baseValue: 10 },
        { id: 'expGain', name: 'EXP Gain', icon: '⭐', color: '#ffdd00', baseValue: 0.05 },
        { id: 'goldGain', name: 'Gold Gain', icon: '💰', color: '#ffd700', baseValue: 0.05 }
    ];

    // Card state tracking
    const cardState = {
        cards: [], // Array of 16 cards
        purchases: 0,
        isAnimating: false,
        currentCost: BASE_COST
    };

    // Initialize card state
    function initializeCards() {
        if (!window.saveData.statCards) {
            window.saveData.statCards = {
                cards: [],
                purchases: 0
            };

            // Create 16 random stat cards
            for (let i = 0; i < CARD_COUNT; i++) {
                const randomStat = STAT_TYPES[Math.floor(Math.random() * STAT_TYPES.length)];
                window.saveData.statCards.cards.push({
                    id: i,
                    statType: randomStat.id,
                    isFlipped: false,
                    level: 0,
                    totalBonus: 0
                });
            }
        }

        cardState.cards = window.saveData.statCards.cards;
        cardState.purchases = window.saveData.statCards.purchases;
        updateCost();
    }

    // Calculate current cost
    function updateCost() {
        cardState.currentCost = Math.floor(BASE_COST * Math.pow(COST_MULTIPLIER, cardState.purchases));
    }

    // Roll rarity using existing system from level-up-system.js
    function rollRarity() {
        if (typeof window.rollUpgradeRarity === 'function') {
            return window.rollUpgradeRarity();
        }

        // Fallback rarity system if level-up-system.js not loaded
        const rand = Math.random();
        if (rand < 0.5) return { name: 'common', scale: 1.0, color: '#888888' };
        if (rand < 0.8) return { name: 'rare', scale: 1.5, color: '#4488ff' };
        if (rand < 0.95) return { name: 'epic', scale: 2.0, color: '#aa44ff' };
        if (rand < 0.99) return { name: 'legendary', scale: 3.0, color: '#ffaa00' };
        return { name: 'mythical', scale: 5.0, color: '#ff0088' };
    }

    // Apply stat bonus to player
    function applyStatBonus(statId, value) {
        if (!window.player) return;

        const bonuses = window.player.permanentBonuses || {};
        bonuses[statId] = (bonuses[statId] || 0) + value;
        window.player.permanentBonuses = bonuses;

        // Apply specific stat updates
        switch (statId) {
            case 'maxHp':
                if (window.player.maxHealth !== undefined) {
                    window.player.maxHealth += value;
                    window.player.health = Math.min(window.player.health + value, window.player.maxHealth);
                }
                break;
            case 'damage':
                if (window.player.damage !== undefined) {
                    window.player.damage += value;
                }
                break;
            case 'armor':
                if (window.player.armor !== undefined) {
                    window.player.armor += value;
                }
                break;
        }
    }

    // Purchase a card (trigger slot machine)
    function purchaseCard() {
        if (cardState.isAnimating) return;
        if (!window.player || window.player.gold < cardState.currentCost) {
            showMessage('Not enough gold!', '#ff4444');
            return;
        }

        // Deduct gold
        window.player.gold -= cardState.currentCost;
        cardState.purchases++;
        window.saveData.statCards.purchases = cardState.purchases;
        updateCost();

        // Roll rarity
        const rarity = rollRarity();

        // Start slot machine animation
        playSlotMachineAnimation(rarity);
    }

    // Slot machine animation
    function playSlotMachineAnimation(rarity) {
        cardState.isAnimating = true;

        const startTime = Date.now();
        let currentHighlight = -1;
        let jumpInterval = JUMP_INTERVAL_START;
        let flashInterval = FLASH_SPEED_START;
        let lastJumpTime = startTime;
        let lastFlashTime = startTime;
        let flashOn = false;

        const animate = () => {
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / ANIMATION_DURATION, 1);

            // Calculate current intervals (slow down jumping, speed up flashing)
            jumpInterval = JUMP_INTERVAL_START + (JUMP_INTERVAL_END - JUMP_INTERVAL_START) * progress;
            flashInterval = FLASH_SPEED_START - (FLASH_SPEED_START - FLASH_SPEED_END) * progress;

            // Update highlight
            if (now - lastJumpTime > jumpInterval) {
                currentHighlight = Math.floor(Math.random() * CARD_COUNT);
                updateCardHighlight(currentHighlight);
                lastJumpTime = now;
            }

            // Update flash
            if (now - lastFlashTime > flashInterval) {
                flashOn = !flashOn;
                updateFlashEffect(flashOn, rarity.color);
                lastFlashTime = now;
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Animation complete - select final card
                finishSlotMachine(rarity);
            }
        };

        animate();
    }

    // Update card highlight
    function updateCardHighlight(index) {
        const cards = document.querySelectorAll('.stat-card');
        cards.forEach((card, i) => {
            if (i === index) {
                card.classList.add('highlighted');
                card.style.transform = 'translateY(-10px) scale(1.1)';
            } else {
                card.classList.remove('highlighted');
                card.style.transform = '';
            }
        });
    }

    // Update flash effect
    function updateFlashEffect(on, color) {
        const overlay = document.getElementById('stat-cards-overlay');
        if (!overlay) return;

        if (on) {
            overlay.style.boxShadow = `inset 0 0 50px ${color}`;
        } else {
            overlay.style.boxShadow = '';
        }
    }

    // Finish slot machine and select card
    function finishSlotMachine(rarity) {
        // Select random card weighted toward unflipped cards
        const unflippedCards = cardState.cards.filter(c => !c.isFlipped);
        let selectedCard;

        if (unflippedCards.length > 0 && Math.random() < 0.7) {
            // 70% chance to select unflipped card
            selectedCard = unflippedCards[Math.floor(Math.random() * unflippedCards.length)];
        } else {
            // 30% chance to select any card (level up existing)
            selectedCard = cardState.cards[Math.floor(Math.random() * CARD_COUNT)];
        }

        const cardIndex = cardState.cards.indexOf(selectedCard);
        const statType = STAT_TYPES.find(s => s.id === selectedCard.statType);

        // Calculate bonus
        const baseValue = statType.baseValue;
        const bonusValue = baseValue * rarity.scale;

        // Update card state
        if (!selectedCard.isFlipped) {
            selectedCard.isFlipped = true;
            selectedCard.level = 1;
            selectedCard.totalBonus = bonusValue;
        } else {
            selectedCard.level++;
            selectedCard.totalBonus += bonusValue;
        }

        // Apply stat bonus
        applyStatBonus(selectedCard.statType, bonusValue);

        // Track achievement stat
        if (!window.saveData.stats) {
            window.saveData.stats = { itemsCrafted: 0, weaponsUpgraded: 0, statCardsUsed: 0, spinWheelSpins: 0, companionsLeveled: 0, buildingsUpgraded: 0, questsCompleted: 0, skillsUnlocked: 0, gearsEquipped: 0 };
        }
        window.saveData.stats.statCardsUsed = (window.saveData.stats.statCardsUsed || 0) + 1;

        // Visual feedback
        highlightSelectedCard(cardIndex, rarity);
        flipCard(cardIndex);
        showCardReveal(selectedCard, statType, rarity, bonusValue);

        // Save state
        window.saveData.statCards.cards = cardState.cards;
        if (typeof window.saveGame === 'function') {
            window.saveGame();
        }

        cardState.isAnimating = false;
        setTimeout(() => renderCards(), 1000);
    }

    // Highlight selected card
    function highlightSelectedCard(index, rarity) {
        const cards = document.querySelectorAll('.stat-card');
        cards.forEach((card, i) => {
            if (i === index) {
                card.style.boxShadow = `0 0 30px ${rarity.color}`;
                card.style.border = `3px solid ${rarity.color}`;
            } else {
                card.style.boxShadow = '';
                card.style.border = '';
            }
        });
    }

    // Flip card animation — golden pop on reveal
    function flipCard(index) {
        const card = document.querySelectorAll('.stat-card')[index];
        if (!card) return;

        card.classList.add('just-flipped');
        setTimeout(() => {
            card.classList.remove('just-flipped');
        }, 600);
    }

    // Show card reveal popup
    function showCardReveal(card, statType, rarity, bonusValue) {
        const popup = document.createElement('div');
        popup.className = 'card-reveal-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            border: 3px solid ${rarity.color};
            border-radius: 20px;
            padding: 30px;
            z-index: 10001;
            text-align: center;
            box-shadow: 0 0 50px ${rarity.color}, inset 0 0 30px rgba(0,0,0,0.5);
            animation: popupAppear 0.4s ease-out;
        `;

        const rarityText = rarity.name.toUpperCase();
        const levelText = card.level > 1 ? ` (Level ${card.level})` : ' (NEW!)';

        popup.innerHTML = `
            <div style="font-size: 48px; margin-bottom: 10px;">${statType.icon}</div>
            <div style="font-size: 24px; font-weight: bold; color: ${rarity.color}; margin-bottom: 5px;">${rarityText}</div>
            <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 10px;">${statType.name}${levelText}</div>
            <div style="font-size: 36px; font-weight: bold; color: ${statType.color}; margin-bottom: 10px;">+${formatStatValue(bonusValue, statType.id)}</div>
            <div style="font-size: 16px; color: #aaa;">Total: ${formatStatValue(card.totalBonus, statType.id)}</div>
            <div style="margin-top: 20px; font-size: 14px; color: #888;">Tap to continue</div>
        `;

        document.body.appendChild(popup);

        // Particle effect
        createParticleEffect(rarity.color);

        // Remove on click
        popup.addEventListener('click', () => {
            popup.style.animation = 'popupDisappear 0.3s ease-in';
            setTimeout(() => popup.remove(), 300);
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (popup.parentNode) {
                popup.style.animation = 'popupDisappear 0.3s ease-in';
                setTimeout(() => popup.remove(), 300);
            }
        }, 5000);
    }

    // Format stat value
    function formatStatValue(value, statId) {
        if (statId.includes('Chance') || statId.includes('Reduction') || statId.includes('Speed') ||
            statId.includes('Gain') || statId === 'lifeSteal' || statId === 'cooldownReduction') {
            return (value * 100).toFixed(1) + '%';
        }
        return value.toFixed(1);
    }

    // Create particle effect
    function createParticleEffect(color) {
        const particleCount = 30;
        const container = document.body;

        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                width: 8px;
                height: 8px;
                background: ${color};
                border-radius: 50%;
                pointer-events: none;
                z-index: 10000;
                box-shadow: 0 0 10px ${color};
            `;

            const angle = (Math.PI * 2 * i) / particleCount;
            const velocity = 3 + Math.random() * 3;
            const vx = Math.cos(angle) * velocity;
            const vy = Math.sin(angle) * velocity;

            container.appendChild(particle);

            let x = 0, y = 0;
            let opacity = 1;

            const animate = () => {
                x += vx;
                y += vy;
                opacity -= 0.02;

                particle.style.transform = `translate(${x}px, ${y}px)`;
                particle.style.opacity = opacity;

                if (opacity > 0) {
                    requestAnimationFrame(animate);
                } else {
                    particle.remove();
                }
            };

            animate();
        }
    }

    // Show message
    function showMessage(text, color) {
        const msg = document.createElement('div');
        msg.textContent = text;
        msg.style.cssText = `
            position: fixed;
            top: 20%;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.9);
            color: ${color};
            padding: 15px 30px;
            border-radius: 10px;
            font-size: 20px;
            font-weight: bold;
            z-index: 10001;
            border: 2px solid ${color};
            box-shadow: 0 0 20px ${color};
            animation: fadeInOut 2s ease-in-out;
        `;

        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 2000);
    }

    // Render stat cards UI
    function renderCards() {
        const overlay = document.getElementById('stat-cards-overlay');
        if (!overlay) return;

        // Build UI
        const html = `
            <div class="stat-cards-container">
                <div class="stat-cards-header">
                    <h2>🎰 Stat Cards</h2>
                    <button class="close-button" onclick="window.StatCards.close()">✕</button>
                </div>

                <div class="stat-cards-info">
                    <div class="info-item">
                        <span class="info-label">Current Cost:</span>
                        <span class="info-value">💰 ${cardState.currentCost} Gold</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Your Gold:</span>
                        <span class="info-value">💰 ${window.player ? window.player.gold : 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Purchases:</span>
                        <span class="info-value">${cardState.purchases}</span>
                    </div>
                </div>

                <button class="purchase-button" onclick="window.StatCards.purchase()" ${cardState.isAnimating ? 'disabled' : ''}>
                    ${cardState.isAnimating ? '🎰 ROLLING...' : `🎰 Roll for ${cardState.currentCost} Gold`}
                </button>

                <div class="cards-grid">
                    ${cardState.cards.map((card, i) => renderCardHTML(card, i)).join('')}
                </div>
            </div>
        `;

        overlay.innerHTML = html;
    }

    // Render single card HTML
    function renderCardHTML(card, index) {
        const statType = STAT_TYPES.find(s => s.id === card.statType);

        if (card.isFlipped) {
            return `
                <div class="stat-card flipped" data-index="${index}">
                    <div class="card-level">Lv ${card.level}</div>
                    <div class="card-icon">${statType.icon}</div>
                    <div class="card-name">${statType.name}</div>
                    <div class="card-value" style="color: ${statType.color};">+${formatStatValue(card.totalBonus, statType.id)}</div>
                </div>
            `;
        } else {
            return `
                <div class="stat-card" data-index="${index}">
                    <div class="card-back">?</div>
                </div>
            `;
        }
    }

    // Open stat cards UI
    function open() {
        initializeCards();

        let overlay = document.getElementById('stat-cards-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'stat-cards-overlay';
            overlay.className = 'building-overlay';
            document.body.appendChild(overlay);
        }

        overlay.style.display = 'flex';
        renderCards();
    }

    // Close stat cards UI
    function close() {
        const overlay = document.getElementById('stat-cards-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // Export public API
    window.StatCards = {
        open,
        close,
        purchase: purchaseCard,
        initialize: initializeCards
    };

})();
