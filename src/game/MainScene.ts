import Phaser from "phaser";
import { PlayroomNetworkManager } from "./net/LivekitNetworkManager";
import { insertCoin } from "playroomkit";

export class MainScene extends Phaser.Scene {
  private readonly playerName: string;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
  };
  private player!: Phaser.Physics.Matter.Sprite;
  private playerNameText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private coins = new Map<number, Phaser.GameObjects.Sprite>();
  private money = 0;
  private network!: PlayroomNetworkManager;
  private remotePlayers = new Map<string, { sprite: Phaser.Physics.Matter.Sprite; nameText: Phaser.GameObjects.Text; tint: number }>();
  private canJump = false;
  private resultsVisible = false;
  private resultsContainer!: Phaser.GameObjects.Container;
  private finishZone!: Phaser.GameObjects.Rectangle;

  private lastSent: { anim: "idle" | "run" | "jump"; flipX: boolean; x: number; y: number; coins: number } = {
    anim: "idle",
    flipX: false,
    x: 0,
    y: 0,
    coins: 0,
  };
  private readonly playerScale = 0.3;
  private readonly bodyH = 90;
  private readonly jumpVelocity = -10.5;

  constructor(playerName: string) {
    super("MainScene");
    this.playerName = playerName;
  }

  preload() {
    this.load.setBaseURL("");

    // Девочка: кадры лежат в public/girl/*.png и доступны по /girl/...
    const loadSeq = (prefix: string, baseName: string, from: number, to: number) => {
      for (let i = from; i <= to; i++) {
        const key = `${prefix}-${i}`;
        const url = encodeURI(`/girl/${baseName} (${i}).png`);
        this.load.image(key, url);
      }
    };

    loadSeq("girl-idle", "Idle", 1, 16);
    loadSeq("girl-run", "Run", 1, 20);
    loadSeq("girl-jump", "Jump", 1, 30);

    // Монета: spritesheet 9 кадров 20x20
    this.load.spritesheet("coin", "/coin3_20x20.png", { frameWidth: 20, frameHeight: 20 });
  }

  create() {
    const worldWidth = this.scale.width * 3;
    const worldHeight = this.scale.height;

    this.network = new PlayroomNetworkManager("Player"); // дефолт имя

    // Ждём готовности Playroom
    setTimeout(() => {
      (window as any).Playroom?.insertCoin().catch(console.error);
    }, 500);

    // Подписки БЕЗ init()
    this.network.onCoinPicked((coinId, by) => {
      const coin = this.coins.get(coinId);
      if (coin) {
        coin.destroy();
        this.coins.delete(coinId);
        if (by === (window as any).Playroom?.myPlayer()?.id) {
          this.money += 1;
          this.moneyText.setText(`💰 ${this.money}`);
        }
      }
    });

    this.network.onBossDefeated(() => this.showResults());

    // Фон
    this.add.rectangle(worldWidth / 2, worldHeight / 2, worldWidth, worldHeight, 0x202233);

    // Пол и платформы (Matter статические тела)
    const groundHeight = 40;
    const groundTopY = worldHeight - groundHeight;
    this.matter.add.rectangle(worldWidth / 2, worldHeight - groundHeight / 2, worldWidth, groundHeight, {
      isStatic: true,
    });
    this.add.rectangle(worldWidth / 2, worldHeight - groundHeight / 2, worldWidth, groundHeight, 0x35354a).setDepth(1);

    const platformY = worldHeight - 180;
    this.matter.add.rectangle(worldWidth / 2, platformY, 260, 24, { isStatic: true });
    this.add.rectangle(worldWidth / 2, platformY, 260, 24, 0x44445f).setDepth(1);

    // Дополнительные платформы для разнообразия
    const midY = worldHeight - 260;
    this.matter.add.rectangle(worldWidth / 4, midY, 180, 20, { isStatic: true });
    this.add.rectangle(worldWidth / 4, midY, 180, 20, 0x3b3b5a).setDepth(1);

    this.matter.add.rectangle((worldWidth * 3) / 4, midY - 40, 160, 20, { isStatic: true });
    this.add.rectangle((worldWidth * 3) / 4, midY - 40, 160, 20, 0x3b3b5a).setDepth(1);

    // Финишная зона (портал к боссу / финалу)
    this.finishZone = this.add
      .rectangle(worldWidth - 120, groundTopY - 60, 80, 120, 0x22c55e, 0.25)
      .setStrokeStyle(2, 0x22c55e)
      .setDepth(2);

    // Анимации (один раз на игру)
    if (!this.anims.exists("girl-idle")) {
      this.anims.create({
        key: "girl-idle",
        frames: Array.from({ length: 16 }, (_, idx) => ({ key: `girl-idle-${idx + 1}` })),
        frameRate: 10,
        repeat: -1,
      });
    }

    if (!this.anims.exists("girl-run")) {
      this.anims.create({
        key: "girl-run",
        frames: Array.from({ length: 20 }, (_, idx) => ({ key: `girl-run-${idx + 1}` })),
        frameRate: 18,
        repeat: -1,
      });
    }

    if (!this.anims.exists("girl-jump")) {
      this.anims.create({
        key: "girl-jump",
        frames: Array.from({ length: 30 }, (_, idx) => ({ key: `girl-jump-${idx + 1}` })),
        frameRate: 18,
        repeat: -1,
      });
    }

    if (!this.anims.exists("coin-spin")) {
      this.anims.create({
        key: "coin-spin",
        frames: this.anims.generateFrameNumbers("coin", { start: 0, end: 8 }),
        frameRate: 12,
        repeat: -1,
      });
    }

    // Игрок
    this.player = this.matter.add
      .sprite(120, groundTopY - this.bodyH / 2, "girl-idle-1")
      .setOrigin(0.5, 0.5)
      .setScale(this.playerScale * 0.85);
    this.player.play("girl-idle");
    // Важно: фиксировать вращение после изменения тела
    this.player.setFixedRotation();
    this.player.setAngularVelocity(0);
    this.player.setRotation(0);

    this.playerNameText = this.add
      .text(this.player.x, this.player.y - 58, this.playerName, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.35)",
        padding: { left: 6, right: 6, top: 3, bottom: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(5);

    // Камера
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // Текст денег
    this.moneyText = this.add.text(16, 16, "💰 0", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "20px",
      color: "#ffffff",
    });
    this.moneyText.setScrollFactor(0);

    // Управление: стрелки + WASD
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      jump: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    };

    // Мобильное управление: тап для прыжка, свайп влево/вправо — движение
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < this.scale.height * 0.6) {
        this.tryJump();
      }
    });

    // Монетки: одинаковые для всех (детерминированный seed)
    const rng = new Phaser.Math.RandomDataGenerator(["womens-day-26-coins"]);
    for (let i = 0; i < 35; i++) {
      const x = rng.between(80, worldWidth - 80);
      const y = rng.between(80, worldHeight - 240);
      const coin = this.matter.add.sprite(x, y, "coin", 0).setScale(1.2);
      coin.play("coin-spin");
      this.coins.set(i, coin);
    }

    // Отслеживание контакта с землёй для прыжка
    this.matter.world.on("collisionactive", (event: Phaser.Physics.Matter.Events.CollisionActiveEvent) => {
      this.canJump = event.pairs.some((pair) => pair.bodyA === this.player.body || pair.bodyB === this.player.body);
    });

    // Синхронизация монеток
    // this.network.onCoinPicked(({ coinId, by }) => {
    //   const coin = this.coins.get(coinId);
    //   if (coin) {
    //     coin.destroy();
    //     this.coins.delete(coinId);
    //   }
    //   if (by === this.network.clientId) {
    //     this.money += 1;
    //     this.moneyText.setText(`💰 ${this.money}`);
    //   }
    // });

    this.matter.world.on("collisionstart", (event: Phaser.Physics.Matter.MatterPhysicsCollisionEvent) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const playerBody = (bodyA as MatterJS.Body).gameObject === this.player ? bodyA : bodyB;
        const coinBody = playerBody === bodyA ? bodyB : bodyA;
        const coin = (coinBody as MatterJS.Body).gameObject as Phaser.Physics.Matter.Sprite;
        if (coin?.texture.key === "coin") {
          const coinId = Array.from(this.coins.entries()).find(([, c]) => c === coin)?.[0];
          if (coinId !== undefined) {
            this.network.requestCoinPickup(coinId!);
          }
        }
      });
    });

    // Экран результатов (покажем в конце после победы над боссом)
    this.resultsContainer = this.createResultsUI();
    this.network.onBossDefeated(() => {
      this.showResults();
    });

    // Сетевые обновления других игроков
    this.network.onRemoteState((remote) => {
      if (remote.id === this.network.clientId) return;

      let entry = this.remotePlayers.get(remote.id);
      if (!entry) {
        const tint = this.tintForId(remote.id);
        const sprite = this.matter.add
          .sprite(remote.x, remote.y, "girl-idle-1")
          .setOrigin(0.5, 0.5)
          .setScale(this.playerScale * 0.85);
        sprite.setFixedRotation();
        sprite.setAngularVelocity(0);
        sprite.setRotation(0);
        sprite.play("girl-idle");
        sprite.setTint(tint);

        const nameText = this.add
          .text(remote.x, remote.y - 58, remote.name, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            color: "#ffffff",
            backgroundColor: "rgba(0,0,0,0.35)",
            padding: { left: 6, right: 6, top: 3, bottom: 3 },
          })
          .setOrigin(0.5, 1)
          .setDepth(5);

        entry = { sprite, nameText, tint };
        this.remotePlayers.set(remote.id, entry);
      } else {
        entry.sprite.setPosition(remote.x, remote.y);
        entry.nameText.setText(remote.name);
      }
      entry.sprite.setData("coins", remote.coins);

      // Анимации/направление удалённого игрока
      entry.sprite.setFlipX(remote.flipX);
      entry.sprite.setAngularVelocity(0);
      entry.sprite.setRotation(0);
      const animKey = remote.anim === "run" ? "girl-run" : remote.anim === "jump" ? "girl-jump" : "girl-idle";
      if (entry.sprite.anims.currentAnim?.key !== animKey) entry.sprite.play(animKey);
    });

    this.network.onRemoteLeave((id) => {
      const entry = this.remotePlayers.get(id);
      if (entry) {
        entry.sprite.destroy();
        entry.nameText.destroy();
        this.remotePlayers.delete(id);
      }
    });
  }

  update() {
    if (this.resultsVisible) return;

    const speed = 5;
    let moveX = 0;

    if (this.cursors.left?.isDown || this.wasd.left.isDown) moveX -= 1;
    if (this.cursors.right?.isDown || this.wasd.right.isDown) moveX += 1;

    if (this.cursors.up?.isDown || this.wasd.jump.isDown) this.tryJump();

    this.player.setVelocityX(moveX * speed);

    // Блокируем вращение (Matter иногда пытается крутить тело при контактах)
    this.player.setAngularVelocity(0);
    this.player.setRotation(0);

    // Направление персонажа — через flipX (это не физическое вращение)
    if (moveX !== 0) this.player.setFlipX(moveX < 0);

    // Анимации локального игрока
    const vy = this.player.body?.velocity.y ?? 0;
    const isAir = Math.abs(vy) > 0.2 && !this.canJump;
    let anim: "idle" | "run" | "jump" = "idle";
    if (isAir) {
      anim = "jump";
      if (this.player.anims.currentAnim?.key !== "girl-jump") this.player.play("girl-jump");
    } else if (moveX !== 0) {
      anim = "run";
      if (this.player.anims.currentAnim?.key !== "girl-run") this.player.play("girl-run");
    } else {
      if (this.player.anims.currentAnim?.key !== "girl-idle") this.player.play("girl-idle");
    }

    // Шлём своё состояние другим вкладкам (дросселируем, чтобы не спамить 60fps)
    const flipX = this.player.flipX;
    const dx = Math.abs(this.player.x - this.lastSent.x);
    const dy = Math.abs(this.player.y - this.lastSent.y);
    if (anim !== this.lastSent.anim || flipX !== this.lastSent.flipX || this.money !== this.lastSent.coins || dx > 0.5 || dy > 0.5) {
      this.lastSent = { anim, flipX, x: this.player.x, y: this.player.y, coins: this.money };
      this.network.sendStateUpdate({
        name: this.playerName,
        anim,
        flipX,
        x: this.player.x,
        y: this.player.y,
        coins: this.money,
      });
    }

    // Обновляем подписи
    this.playerNameText.setPosition(this.player.x, this.player.y - 58);
    for (const { sprite, nameText } of this.remotePlayers.values()) {
      nameText.setPosition(sprite.x, sprite.y - 58);
    }
  }

  resize(width: number, height: number) {
    this.cameras.resize(width, height);
  }

  private tryJump() {
    if (!this.canJump) return;
    this.player.setVelocityY(this.jumpVelocity);
  }

  private tintForId(id: string) {
    const palette = [
      0xffc8dd, // нежно-розовый
      0xffafcc, // розовый
      0xcdb4db, // сиреневый
      0xbde0fe, // небесный
      0xa2d2ff, // голубой
      0xfde2e4, // pastel pink
      0xffe5ec, // blush
      0xf7cad0, // dusty pink
      0xe0aaff, // lavender
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  }

  private createResultsUI() {
    const bg = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x000000, 0.65);
    bg.setScrollFactor(0).setDepth(50);

    const panel = this.add.rectangle(this.scale.width / 2, this.scale.height / 2, Math.min(520, this.scale.width - 40), 320, 0x1b1b2a, 0.95);
    panel.setScrollFactor(0).setDepth(51);

    const title = this.add.text(this.scale.width / 2, this.scale.height / 2 - 130, "Итоги: кто сколько нафармил 💰", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "18px",
      color: "#ffffff",
    });
    title.setOrigin(0.5, 0).setScrollFactor(0).setDepth(52);

    const body = this.add.text(this.scale.width / 2, this.scale.height / 2 - 90, "", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "16px",
      color: "rgba(255,255,255,0.92)",
      align: "center",
      lineSpacing: 6,
    });
    body.setOrigin(0.5, 0).setScrollFactor(0).setDepth(52);
    body.setName("resultsBody");

    const hint = this.add.text(this.scale.width / 2, this.scale.height / 2 + 120, "Окно появится после победы над боссом.", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "12px",
      color: "rgba(255,255,255,0.65)",
    });
    hint.setOrigin(0.5, 0).setScrollFactor(0).setDepth(52);

    const container = this.add.container(0, 0, [bg, panel, title, body, hint]);
    container.setDepth(60);
    container.setVisible(false);
    return container;
  }

  private showResults() {
    const body = this.resultsContainer.getByName("resultsBody") as Phaser.GameObjects.Text | null;
    const stats = this.network.getPlayersSnapshot().sort((a, b) => b.coins - a.coins);
    const lines = stats.map((p, idx) => `${idx + 1}. ${p.name}: ${p.coins}`);
    body?.setText(lines.join("\n"));
    this.resultsVisible = true;
    this.resultsContainer.setVisible(true);
  }
}
