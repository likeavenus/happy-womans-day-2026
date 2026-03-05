import "./style.css";
import Phaser from "phaser";
import { MainScene } from "./game/MainScene";

function renderJoinScreen(onJoin: (name: string) => void) {
  const overlay = document.querySelector<HTMLDivElement>("#overlay");
  if (!overlay) return;

  const saved = sessionStorage.getItem("playerName") ?? "";

  overlay.innerHTML = `
    <div class="card">
      <h1>LiveKit — вход в комнату</h1>
      <p>Введи имя, чтобы оно отображалось над персонажем. (Аудио/видео выключены — это только мультиплеер.)</p>
      <form id="joinForm" class="row" autocomplete="off">
        <input id="nameInput" maxlength="18" placeholder="Твоё имя" value="${saved.replaceAll('"', "&quot;")}" />
        <button type="submit">Войти</button>
      </form>
    </div>
  `;

  const form = overlay.querySelector<HTMLFormElement>("#joinForm");
  const input = overlay.querySelector<HTMLInputElement>("#nameInput");
  input?.focus();

  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = (input?.value ?? "").trim() || "Аноним";
    sessionStorage.setItem("playerName", name);
    overlay.style.display = "none";
    onJoin(name);
  });
}

function startGame(playerName: string) {
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
    scene: [new MainScene(playerName)],
  };

  // Инициализация игры Phaser (экземпляр сохранять не обязательно)
  new Phaser.Game(config);
}

renderJoinScreen((name) => startGame(name));
