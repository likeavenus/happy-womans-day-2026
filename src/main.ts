import "./style.css";
import Phaser from "phaser";
import { MainScene } from "./game/MainScene";
import * as Playroom from "playroomkit";

(window as any).Playroom = Playroom;

// Сразу запускаем игру, не показывая кастомный экран
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#1e1e2e",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 960,
    height: 540,
  },
  physics: {
    default: "matter",
    matter: {
      gravity: { x: 0, y: 1.2 },
      debug: true,
    },
  },
  scene: [new MainScene()], // без параметра
};

new Phaser.Game(config);
