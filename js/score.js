import { System, Tag } from './engine/core/ecs.js';
import { Stage } from './engine/core/stage.js';
import { GameState } from './player.js';

export class Points {
  constructor(value = 100) {
    this.value = value;
  }
}

export class ScoreSystem extends System {
  stage = Stage.Last;

  init() {
    this.pointsQuery = this.query(Tag('dead'), Points);
    this.scoreElement = document.getElementById('score');
  }

  execute() {
    const gameState = this.singleton.get(GameState);
    this.pointsQuery.forEach((entity, dead, points) => {
      gameState.score += points.value;
    });
  }
}
