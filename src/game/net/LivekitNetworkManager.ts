export type RemotePlayerState = {
  id: string;
  name: string;
  x: number;
  y: number;
  anim: string;
  flipX: boolean;
  coins: number;
};

export type FireballData = {
  id: string; // уникальный id для фаербола (можно генерировать)
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: string;
};

type PlayerStateCallback = (s: RemotePlayerState) => void;
type BossCallback = () => void;
type LeaveCallback = (playerId: string) => void;
type CoinCallback = (coinId: string, playerId: string) => void;

export class LivekitNetworkManager {
  public myId: string;
  private stateListeners: PlayerStateCallback[] = [];
  private coinListeners: CoinCallback[] = [];
  private bossListeners: BossCallback[] = [];
  private leaveListeners: LeaveCallback[] = [];
  private players = new Map<string, { name: string; coins: number }>(); // для статистики
  private fireballListeners: ((fb: FireballData) => void)[] = [];
  private playroom: any;
  private bossHitListeners: ((damage: number) => void)[] = [];
  private fireballDestroyListeners: ((id: string) => void)[] = [];

  constructor() {
    const Playroom = (window as any).Playroom;
    this.playroom = Playroom;

    this.myId = Playroom.myPlayer()?.id || "";

    // ===== ДВИЖЕНИЕ (SNAPSHOT) =====
    Playroom.RPC.register("playerSnapshot", (data: RemotePlayerState) => {
      this.players.set(data.id, { name: data.name, coins: data.coins }); // <-- добавить
      this.stateListeners.forEach((cb) => cb(data));
    });

    Playroom.RPC.register("coinPicked", (data: { coinId: string; playerId: string }) => {
      console.log("🪙 RPC coinPicked", data);
      this.coinListeners.forEach((cb) => cb(data.coinId, data.playerId));
    });

    // ===== БОСС =====
    Playroom.RPC.register("bossDefeated", () => {
      console.log("👑 RPC bossDefeated");
      this.bossListeners.forEach((cb) => cb());
    });

    // ===== УХОД ИГРОКА =====
    if (typeof Playroom.onPlayerLeave === "function") {
      Playroom.onPlayerLeave((player: any) => {
        console.log("🚪 PLAYER LEFT", player.id);
        this.leaveListeners.forEach((cb) => cb(player.id));
      });
    } else {
      console.warn("Playroom.onPlayerLeave is not a function — player leave events won't be handled.");
    }

    Playroom.RPC.register("fireballSpawn", (data: FireballData) => {
      this.fireballListeners.forEach((cb) => cb(data));
    });

    Playroom.RPC.register("bossHit", (damage: number) => {
      this.bossHitListeners.forEach((cb) => cb(damage));
    });

    Playroom.RPC.register("fireballDestroy", (data: { id: string }) => {
      this.fireballDestroyListeners.forEach((cb) => cb(data.id));
    });
  }

  // =========================
  // ДВИЖЕНИЕ
  // =========================
  onRemoteState(cb: PlayerStateCallback) {
    this.stateListeners.push(cb);
  }

  sendSnapshot(state: RemotePlayerState) {
    const Playroom = (window as any).Playroom;
    Playroom.RPC.call("playerSnapshot", state);
    this.players.set(state.id, { name: state.name, coins: state.coins });
  }

  // =========================
  // МОНЕТЫ
  // =========================
  onCoinPicked(cb: CoinCallback) {
    this.coinListeners.push(cb);
  }

  sendCoinPicked(coinId: string, playerId: string) {
    const Playroom = (window as any).Playroom;
    console.log("📤 RPC coinPicked", { coinId, playerId });
    Playroom.RPC.call("coinPicked", { coinId, playerId });
  }

  // =========================
  // БОСС
  // =========================
  onBossDefeated(cb: BossCallback) {
    this.bossListeners.push(cb);
  }

  sendBossDefeated() {
    const Playroom = (window as any).Playroom;
    console.log("📤 RPC bossDefeated");
    Playroom.RPC.call("bossDefeated");
  }

  onRemoteLeave(cb: LeaveCallback) {
    this.leaveListeners.push(cb);
  }

  getPlayersSnapshot() {
    return Array.from(this.players.entries()).map(([id, data]) => ({
      id,
      name: data.name,
      coins: data.coins,
    }));
  }

  onFireballSpawn(cb: (fb: FireballData) => void) {
    this.fireballListeners.push(cb);
  }

  sendFireball(data: FireballData) {
    this.playroom.RPC.call("fireballSpawn", data);
  }

  onBossHit(cb: (damage: number) => void) {
    this.bossHitListeners.push(cb);
  }

  sendBossHit(damage: number) {
    this.playroom.RPC.call("bossHit", damage);
  }

  onFireballDestroy(cb: (id: string) => void) {
    this.fireballDestroyListeners.push(cb);
  }

  sendFireballDestroy(id: string) {
    this.playroom.RPC.call("fireballDestroy", { id });
  }
}
