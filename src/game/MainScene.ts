import Phaser from "phaser";
import { LivekitNetworkManager } from "./net/LivekitNetworkManager";

export class MainScene extends Phaser.Scene {
  private officeEmojis = ["📄", "📎", "☕", "💻", "📊", "📅", "✉️", "🖨️"];
  private readonly playerName: string = "";
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    jump: Phaser.Input.Keyboard.Key;
  };
  private fireballs: Phaser.Physics.Matter.Sprite[] = [];
  private player!: Phaser.Physics.Matter.Sprite;
  private playerNameText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private coins = new Map<number, Phaser.GameObjects.Sprite>();
  private money = 0;
  private network!: LivekitNetworkManager;
  private lastNetSend = 0;
  private remotePlayers = new Map<string, { sprite: Phaser.Physics.Matter.Sprite; nameText: Phaser.GameObjects.Text; tint: number }>();
  private canJump = false;
  private resultsVisible = false;
  private resultsContainer!: Phaser.GameObjects.Container;
  private finishZone!: Phaser.GameObjects.Rectangle;

  private boss!: Phaser.Physics.Matter.Sprite;
  private bossHP = 5;
  private bossActive = false;
  private bossAttackTimer = 0;
  private bossInvincible = false;
  private bossInvincibleTimer = 0;
  private bossHealthBar!: Phaser.GameObjects.Graphics;
  private bossHealthBarBg!: Phaser.GameObjects.Graphics;

  private emojis: Phaser.Physics.Matter.Sprite[] = [];

  private playerInvincible = false;
  private playerInvincibleTimer = 0;

  private gameReady = false;

  private lastSent: { anim: "idle" | "run" | "jump"; flipX: boolean; x: number; y: number; coins: number } = {
    anim: "idle",
    flipX: false,
    x: 0,
    y: 0,
    coins: 0,
  };
  private readonly playerScale = 0.2;
  private readonly bodyH = 90;
  private readonly jumpVelocity = -15;

  constructor() {
    super("MainScene");
  }

  preload() {
    this.load.setBaseURL("");

    // Девочка: кадры лежат в public/girl/*.png
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

    this.load.image("boss", "/boss.png");
    this.load.image("boss_hit", "/boss-2.png");

    for (let i = 1; i <= 5; i++) {
      const key = `fireball-${i}`;
      const url = `/fireball/FB00${i}.png`; // предполагаем имена FB001.png ... FB005.png
      this.load.image(key, url);
    }

    // Монета: spritesheet
    this.load.spritesheet("coin", "/coin3_20x20.png", { frameWidth: 20, frameHeight: 20 });
  }

  async create() {
    console.log("🟢 create started");
    try {
      await this.initPlayroom();
      console.log("✅ initPlayroom completed");

      const myPlayer = (window as any).Playroom?.myPlayer();
      const playerName = myPlayer?.getProfile().name || "Игрок";
      console.log(`👤 Player name: ${playerName}`);

      this.network = new LivekitNetworkManager(playerName);
      this.setupGame();
    } catch (error) {
      console.error("❌ Ошибка при инициализации:", error);
      // Покажем сообщение об ошибке на экране, чтобы игрок понял, что пошло не так
      this.add
        .text(400, 300, "Ошибка подключения к Playroom. Смотри консоль.", {
          color: "#ff0000",
          fontSize: "20px",
        })
        .setOrigin(0.5);
    }
  }

  private async initPlayroom(): Promise<void> {
    console.log("⏳ initPlayroom: insertCoin...");
    try {
      // Ждём завершения insertCoin с таймаутом 10 секунд
      await Promise.race([
        (window as any).Playroom?.insertCoin({
          room: "womens-day-26",
          maxPlayers: 10,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Playroom connection timeout")), 10000)),
      ]);
      console.log("✅ insertCoin выполнен");
    } catch (error) {
      console.error("❌ Ошибка при подключении к Playroom:", error);
    }
  }

  private setupGame() {
    // this.network.onRemoteState((remote) => {
    //   console.log("🎨 RENDER REMOTE", remote.id, remote.x, remote.y, remote.anim);
    // });
    console.log("🟢 setupGame started");
    const worldWidth = this.scale.width * 3;
    const worldHeight = this.scale.height;

    this.network.onCoinPicked((coinId: string, byPlayerId: string) => {
      const coin = this.coins.get(+coinId);
      if (coin) {
        coin.destroy();
        this.coins.delete(+coinId);
        if (byPlayerId === (window as any).Playroom?.myPlayer()?.id) {
          this.money += 1;
          this.moneyText.setText(`💰 ${this.money}`);
        }
      }
    });

    this.network.onBossDefeated(() => this.showResults());

    // Фон
    this.add.rectangle(worldWidth / 2, worldHeight / 2, worldWidth, worldHeight, 0x202233);

    // Пол и платформы
    const groundHeight = 40;
    const groundTopY = worldHeight - groundHeight;
    this.matter.add.rectangle(worldWidth / 2, worldHeight - groundHeight / 2, worldWidth, groundHeight, {
      isStatic: true,
    });
    this.add.rectangle(worldWidth / 2, worldHeight - groundHeight / 2, worldWidth, groundHeight, 0x35354a).setDepth(1);

    const platformY = worldHeight - 180;
    this.matter.add.rectangle(worldWidth / 2, platformY, 260, 24, { isStatic: true });
    this.add.rectangle(worldWidth / 2, platformY, 260, 24, 0x44445f).setDepth(1);

    const midY = worldHeight - 260;
    this.matter.add.rectangle(worldWidth / 4, midY, 180, 20, { isStatic: true });
    this.add.rectangle(worldWidth / 4, midY, 180, 20, 0x3b3b5a).setDepth(1);

    this.matter.add.rectangle((worldWidth * 3) / 4, midY - 40, 160, 20, { isStatic: true });
    this.add.rectangle((worldWidth * 3) / 4, midY - 40, 160, 20, 0x3b3b5a).setDepth(1);

    // Финишная зона
    this.finishZone = this.add
      .rectangle(worldWidth - 120, groundTopY - 60, 80, 120, 0x22c55e, 0.25)
      .setStrokeStyle(2, 0x22c55e)
      .setDepth(2);

    // Анимации
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

    if (!this.anims.exists("fireball")) {
      this.anims.create({
        key: "fireball",
        frames: [{ key: "fireball-1" }, { key: "fireball-2" }, { key: "fireball-3" }, { key: "fireball-4" }, { key: "fireball-5" }],
        frameRate: 12,
        repeat: -1,
      });
    }

    // Локальный игрок
    this.player = this.matter.add
      .sprite(120, groundTopY - this.bodyH / 2, "girl-idle-1")
      .setOrigin(0.5, 0.5)
      .setScale(this.playerScale * 0.85);
    this.player.play("girl-idle");
    this.player.setFixedRotation();
    this.player.setAngularVelocity(0);
    this.player.setRotation(0);

    // Имя над игроком
    const myProfile = (window as any).Playroom?.myPlayer()?.getProfile();
    const displayName = myProfile?.name || "Игрок";
    this.playerNameText = this.add
      .text(this.player.x, this.player.y - 58, displayName, {
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

    // Управление
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      jump: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    };

    // Мобильное управление
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.y < this.scale.height * 0.6) this.tryJump();
    });

    // Монетки
    const rng = new Phaser.Math.RandomDataGenerator(["womens-day-26-coins"]);
    for (let i = 0; i < 35; i++) {
      const x = rng.between(80, worldWidth - 80);
      const y = rng.between(80, worldHeight - 240);
      const coin = this.matter.add.sprite(x, y, "coin", 0).setScale(1.2).setIgnoreGravity(true);
      coin.play("coin-spin");
      this.coins.set(i, coin);
    }

    // Отслеживание контакта с землёй
    this.matter.world.on("collisionactive", (event: Phaser.Physics.Matter.Events.CollisionActiveEvent) => {
      this.canJump = event.pairs.some((pair) => pair.bodyA === this.player.body || pair.bodyB === this.player.body);
    });

    // Сбор монет
    this.matter.world.on("collisionstart", (event: Phaser.Physics.Matter.MatterPhysicsCollisionEvent) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        const playerBody = (bodyA as MatterJS.Body).gameObject === this.player ? bodyA : bodyB;
        const coinBody = playerBody === bodyA ? bodyB : bodyA;
        const coin = (coinBody as MatterJS.Body).gameObject as Phaser.Physics.Matter.Sprite;
        if (coin?.texture.key === "coin") {
          const coinId = Array.from(this.coins.entries()).find(([, c]) => c === coin)?.[0];
          if (coinId !== undefined) {
            // this.network.sendCoinPicked(coinId);
            const myId = (window as any).Playroom?.myPlayer()?.id;
            if (myId) {
              this.network.sendCoinPicked(coinId.toString(), myId);
            }
          }
        }

        // В collisionstart:
        const gameObjectA = (bodyA as MatterJS.Body).gameObject;
        const gameObjectB = (bodyB as MatterJS.Body).gameObject;

        // Определяем, есть ли среди столкнувшихся объектов фаербол
        let fireballObj: Phaser.Physics.Matter.Sprite | null = null;
        if (gameObjectA?.getData("owner") !== undefined) fireballObj = gameObjectA;
        else if (gameObjectB?.getData("owner") !== undefined) fireballObj = gameObjectB;

        if (fireballObj) {
          this.destroyFireball(fireballObj); // уничтожаем при любом столкновении
        }

        let emojiObj: Phaser.Physics.Matter.Image | null = null;
        if (gameObjectA?.getData("type") === "emoji") emojiObj = gameObjectA;
        else if (gameObjectB?.getData("type") === "emoji") emojiObj = gameObjectB;

        if (emojiObj) {
          if (gameObjectA === this.player || gameObjectB === this.player) {
            this.hitPlayer(emojiObj); // попадание в игрока
          } else {
            this.destroyEmoji(emojiObj); // столкновение с чем-то другим
          }
        }
      });
    });

    this.network.onFireballSpawn((data) => {
      // Создаём фаербол на стороне других игроков
      const fireball = this.matter.add
        .sprite(data.x, data.y, "fireball-1")
        .setScale(0.5)
        .setCircle(12)
        .setFixedRotation()
        .setIgnoreGravity(true)
        .play("fireball");
      fireball.setVelocity(data.vx, data.vy);
      fireball.setData("owner", data.owner);
      fireball.setData("id", data.id);
      this.fireballs.push(fireball);

      this.time.delayedCall(5000, () => {
        if (fireball.scene) {
          this.destroyFireball(fireball, false); // false – не отправляем RPC (создатель уже отправил)
        }
      });
    });

    this.network.onFireballDestroy((id) => {
      const fireball = this.fireballs.find((fb) => fb.getData("id") === id);
      if (fireball) {
        this.destroyFireball(fireball, false); // false – не отправлять RPC повторно
      }
    });

    this.network.onBossHit((damage) => {
      if (!this.boss || this.bossHP <= 0) return;
      this.bossHP -= damage;
      if (this.bossHP <= 0) {
        this.defeatBoss();
      } else {
        // Визуальный эффект получения урона (мерцание)
        this.boss.setTint(0xff0000);
        this.time.delayedCall(200, () => this.boss.clearTint());
        this.updateBossHealthBar();
      }
    });

    // Экран результатов
    this.resultsContainer = this.createResultsUI();
    this.network.onRemoteState((remote) => {
      if (remote.id === (window as any).Playroom?.myPlayer()?.id) return;

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
        // Добавляем target-поля для интерполяции
        (sprite as any).targetX = remote.x;
        (sprite as any).targetY = remote.y;

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
        // Обновляем только целевые координаты и имя
        (entry.sprite as any).targetX = remote.x;
        (entry.sprite as any).targetY = remote.y;
        entry.nameText.setText(remote.name);
      }
      // if (!entry) {
      //   const tint = this.tintForId(remote.id);
      //   const sprite = this.matter.add
      //     .sprite(remote.x, remote.y, "girl-idle-1")
      //     .setOrigin(0.5, 0.5)
      //     .setScale(this.playerScale * 0.85);
      //   sprite.setFixedRotation();
      //   sprite.setAngularVelocity(0);
      //   sprite.setRotation(0);
      //   sprite.play("girl-idle");
      //   sprite.setTint(tint);

      //   const nameText = this.add
      //     .text(remote.x, remote.y - 58, remote.name, {
      //       fontFamily: "system-ui, sans-serif",
      //       fontSize: "14px",
      //       color: "#ffffff",
      //       backgroundColor: "rgba(0,0,0,0.35)",
      //       padding: { left: 6, right: 6, top: 3, bottom: 3 },
      //     })
      //     .setOrigin(0.5, 1)
      //     .setDepth(5);

      //   entry = { sprite, nameText, tint };
      //   this.remotePlayers.set(remote.id, entry);
      // } else {
      //   // entry.sprite.x = Phaser.Math.Linear(entry.sprite.x, remote.x, 0.35);
      //   // entry.sprite.y = Phaser.Math.Linear(entry.sprite.y, remote.y, 0.35);
      //   // entry.nameText.setText(remote.name);
      //   entry.sprite.x = Phaser.Math.Linear(entry.sprite.x, remote.x, 0.35);
      //   entry.sprite.y = Phaser.Math.Linear(entry.sprite.y, remote.y, 0.35);
      //   entry.nameText.setText(remote.name);
      // }
      entry.sprite.setData("coins", remote.coins);

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

    this.gameReady = true;
    console.log("✅ setupGame completed, gameReady = true");

    const bossX = worldWidth - 200;
    const bossY = groundTopY - 150; // чуть выше земли
    this.boss = this.matter.add.sprite(bossX, bossY, "boss").setOrigin(0.5, 0.5).setScale(0.5).setFixedRotation();
    this.boss.setStatic(true); // пока не двигаем
    this.bossHP = 5;
    this.bossActive = false;
    this.bossAttackTimer = 0;

    this.network.onBossDefeated(() => {
      if (this.boss) this.boss.destroy();
      this.showResults();
    });

    this.bossHealthBarBg = this.add.graphics().setDepth(10);
    this.bossHealthBar = this.add.graphics().setDepth(11);
    this.updateBossHealthBar();
  }

  update(time: number) {
    if (!this.gameReady) return;
    if (this.resultsVisible) return;

    if (Phaser.Input.Keyboard.JustDown(this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE))) {
      this.shootFireball();
    }

    // =========================
    // 1. ЛОКАЛЬНОЕ УПРАВЛЕНИЕ
    // =========================

    const speed = 5;
    let moveX = 0;

    if (this.cursors.left?.isDown || this.wasd.left.isDown) moveX -= 1;
    if (this.cursors.right?.isDown || this.wasd.right.isDown) moveX += 1;
    if (this.cursors.up?.isDown || this.wasd.jump.isDown) this.tryJump();

    this.player.setVelocityX(moveX * speed);
    this.player.setAngularVelocity(0);
    this.player.setRotation(0);

    if (moveX !== 0) this.player.setFlipX(moveX < 0);

    // =========================
    // 2. АНИМАЦИИ ЛОКАЛЬНОГО ИГРОКА
    // =========================

    const vy = this.player.body?.velocity.y ?? 0;
    const isAir = Math.abs(vy) > 0.2 && !this.canJump;

    let anim: "idle" | "run" | "jump" = "idle";

    if (isAir) {
      anim = "jump";
      if (this.player.anims.currentAnim?.key !== "girl-jump") {
        this.player.play("girl-jump");
      }
    } else if (moveX !== 0) {
      anim = "run";
      if (this.player.anims.currentAnim?.key !== "girl-run") {
        this.player.play("girl-run");
      }
    } else {
      anim = "idle";
      if (this.player.anims.currentAnim?.key !== "girl-idle") {
        this.player.play("girl-idle");
      }
    }

    // =========================
    // 3. ОТПРАВКА SNAPSHOT (RPC)
    // =========================
    // ❗ НЕ КАЖДЫЙ КАДР — ~12 РАЗ/СЕК

    const now = performance.now();
    if (now - this.lastNetSend > 80) {
      this.lastNetSend = now;

      const myProfile = (window as any).Playroom?.myPlayer()?.getProfile();
      const myName = myProfile?.name || "Игрок";

      this.network.sendSnapshot({
        id: (window as any).Playroom.myPlayer().id,
        x: this.player.x,
        y: this.player.y,
        anim,
        flipX: this.player.flipX,
        coins: this.money,
        name: myName,
      });

      if (this.boss && this.bossHP > 0) {
        const distToPlayer = Phaser.Math.Distance.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
        if (!this.bossActive && distToPlayer < 300) {
          this.bossActive = true;
        }

        if (this.bossActive) {
          this.bossAttackTimer += this.game.loop.delta;
          if (this.bossAttackTimer >= 800) {
            this.bossAttackTimer = 0;
            this.spawnEmoji();
          }
        }

        if (this.bossInvincible) {
          this.bossInvincibleTimer -= this.game.loop.delta;
          if (this.bossInvincibleTimer <= 0) {
            this.bossInvincible = false;
            this.boss.clearTint();
          }
        }
      }

      this.updateBossHealthBar();
    }

    // =========================
    // 4. ПЛАВНОЕ ДВИЖЕНИЕ REMOTE ИГРОКОВ
    // =========================

    // for (const { sprite, nameText } of this.remotePlayers.values()) {
    //   // @ts-ignore
    //   if (sprite.targetX !== undefined) {
    //     // @ts-ignore
    //     sprite.x = Phaser.Math.Linear(sprite.x, sprite.targetX, 0.25);
    //     // @ts-ignore
    //     sprite.y = Phaser.Math.Linear(sprite.y, sprite.targetY, 0.25);
    //   }

    //   nameText.setPosition(sprite.x, sprite.y - 58);
    // }
    for (const { sprite, nameText } of this.remotePlayers.values()) {
      const targetX = (sprite as any).targetX;
      const targetY = (sprite as any).targetY;
      if (targetX !== undefined && targetY !== undefined) {
        // Плавное движение с коэффициентом 0.1 (можно регулировать)
        sprite.x += (targetX - sprite.x) * 0.1;
        sprite.y += (targetY - sprite.y) * 0.1;
      }
      nameText.setPosition(sprite.x, sprite.y - 58);
    }

    // =========================
    // 5. ИМЯ ЛОКАЛЬНОГО ИГРОКА
    // =========================

    this.playerNameText.setPosition(this.player.x, this.player.y - 58);
  }
  resize(width: number, height: number) {
    this.cameras.resize(width, height);
  }

  private tryJump() {
    if (!this.canJump) return;
    this.player.setVelocityY(this.jumpVelocity);
  }

  private tintForId(id: string) {
    const palette = [0xffc8dd, 0xffafcc, 0xcdb4db, 0xbde0fe, 0xa2d2ff, 0xfde2e4, 0xffe5ec, 0xf7cad0, 0xe0aaff];
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

  private spawnEmoji() {
    if (!this.boss || this.bossHP <= 0) return;
    const dir = new Phaser.Math.Vector2(this.player.x - this.boss.x, this.player.y - this.boss.y).normalize();
    const speed = 8;
    const randomEmoji = this.officeEmojis[Math.floor(Math.random() * this.officeEmojis.length)];

    // Создаём текст как физический объект
    const emojiText = this.add
      .text(this.boss.x, this.boss.y - 30, randomEmoji, {
        fontSize: "32px",
        fontFamily: "Arial, sans-serif",
      })
      .setOrigin(0.5);

    // Превращаем в физическое тело (круглая форма)
    const emojiBody = this.matter.add.gameObject(emojiText, {
      shape: { type: "circle", radius: 16 },
      restitution: 0.8,
      frictionAir: 0.01,
    }) as Phaser.Physics.Matter.Image; // но это будет Matter.Image, но нам нужен доступ к text? Можно хранить как any.

    emojiBody.setVelocity(dir.x * speed, dir.y * speed);
    emojiBody.setData("type", "emoji");
    emojiBody.setData("textObj", emojiText); // чтобы потом удалить
    this.emojis.push(emojiBody);
  }

  // В обработчике коллизий и удалении:
  private destroyEmoji(emoji: Phaser.Physics.Matter.Image) {
    const idx = this.emojis.indexOf(emoji);
    if (idx !== -1) this.emojis.splice(idx, 1);
    const textObj = emoji.getData("textObj");
    if (textObj) textObj.destroy();
    emoji.destroy();
  }

  private updateBossHealthBar() {
    if (!this.boss || this.bossHP <= 0) return;
    const barWidth = 100;
    const barHeight = 10;
    const x = this.boss.x - barWidth / 2;
    const y = this.boss.y - 80;

    this.bossHealthBarBg.clear();
    this.bossHealthBarBg.fillStyle(0x000000, 0.5);
    this.bossHealthBarBg.fillRect(x, y, barWidth, barHeight);

    this.bossHealthBar.clear();
    this.bossHealthBar.fillStyle(0x00ff00, 1);
    const healthPercent = this.bossHP / 5; // максимум 5 HP
    this.bossHealthBar.fillRect(x, y, barWidth * healthPercent, barHeight);
  }

  private shootFireball() {
    const dir = this.player.flipX ? -1 : 1; // -1 влево, 1 вправо
    const startX = this.player.x + dir * 40;
    const startY = this.player.y - 20;

    // Создаём спрайт фаербола как физическое тело
    const fireball = this.matter.add.sprite(startX, startY, "fireball-1").setScale(0.5).setCircle(12).setFixedRotation().play("fireball");

    const fireballId = Phaser.Math.RND.uuid();
    fireball.setVelocity(dir * 10, 0); // летит горизонтально
    fireball.setData("owner", this.network.myId); // запоминаем владельца
    console.log("this.network.myId: ", this.network.myId);

    // Отправляем по сети информацию о новом фаерболе
    this.network.sendFireball({
      id: fireballId,
      x: startX,
      y: startY,
      vx: dir * 10,
      vy: 0,
      owner: this.network.myId,
    });

    // Добавляем в локальный массив для отслеживания
    // (можно хранить все фаерболы в одном массиве, различая по владельцу)
    this.fireballs.push(fireball);

    this.time.delayedCall(6000, () => {
      if (fireball.scene) {
        // проверяем, что ещё существует
        this.destroyFireball(fireball, true);
      }
    });
  }

  private defeatBoss() {
    if (!this.boss || this.bossHP <= 0) return;
    this.boss.destroy();
    this.network.sendBossDefeated();
    // Показываем результаты локально (RPC вызовет showResults у всех)
  }

  private destroyFireball(fireball: Phaser.Physics.Matter.Sprite, sendRpc: boolean = true) {
    if (!fireball || fireball.scene !== this) return; // уже уничтожен
    const idx = this.fireballs.indexOf(fireball);
    if (idx !== -1) this.fireballs.splice(idx, 1);
    if (sendRpc) {
      const id = fireball.getData("id");
      if (id) this.network.sendFireballDestroy(id);
    }
    fireball.destroy();
  }

  private hitPlayer(emoji: Phaser.Physics.Matter.Image) {
    if (this.playerInvincible) return;
    this.playerInvincible = true;
    this.playerInvincibleTimer = 2000; // 2 секунды неуязвимости
    this.player.setTint(0xffaaaa);

    // Отбрасывание в направлении от эмодзи
    const dir = new Phaser.Math.Vector2(this.player.x - emoji.x, this.player.y - emoji.y).normalize();
    this.player.setVelocity(dir.x * 10, dir.y * 10 - 5);

    this.destroyEmoji(emoji);
  }
}
