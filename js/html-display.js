import { System, Tag } from './engine/core/ecs.js';
import { GameState } from './player.js';

// System that handles communication back-and-forth with the page HTML
export class HTMLDisplaySystem extends System {
  init() {
    this.levelTitle = document.getElementById('level-title');
    this.scoreDisplay = document.getElementById('score-display');
    this.livesDisplay = document.getElementById('lives-display');
    this.replayButton = document.getElementById('replay-button');
    
    this.replayButton.addEventListener('click', () => {
      // Reset the GameState
      this.singleton.add(new GameState());
    });
  }

  execute() {
    const gameState = this.singleton.get(GameState);

    if (gameState.lives == 0) {
      this.levelTitle.innerText = `Game Over`;
      this.levelTitle.classList.add('show');
      this.replayButton.classList.add('show');
    } else if (gameState.levelStarting && gameState.level > 0) {
      this.levelTitle.innerText = `Level ${gameState.level}`;
      this.levelTitle.classList.add('show');
      this.replayButton.classList.remove('remove');
    } else {
      this.levelTitle.classList.remove('show');
      this.replayButton.classList.remove('show');
    }

    this.scoreDisplay.innerText = `Score: ${gameState.score}`;
    this.livesDisplay.innerText = `Lives: ${gameState.lives}`;
  }
}