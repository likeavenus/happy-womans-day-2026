// // PlayroomNetworkManager.ts - БЕЗ ОШИБОК ИМПОРТА
// import * as Playroom from "playroomkit";

// export type RemotePlayerState = {
//   id: string;
//   name: string;
//   anim: "idle" | "run" | "jump";
//   flipX: boolean;
//   x: number;
//   y: number;
//   coins: number;
// };

// type StateListener = (state: RemotePlayerState) => void;
// type LeaveListener = (id: string) => void;
// type CoinPickedListener = (coinId: number, by: string) => void;
// type BossDefeatedListener = () => void;

// export class PlayroomNetworkManager {
//   name: string;
//   private stateListeners: StateListener[] = [];
//   private leaveListeners: LeaveListener[] = [];
//   private coinPickedListeners: CoinPickedListener[] = [];
//   private bossDefeatedListeners: BossDefeatedListener[] = [];
//   private pickedCoins = new Set<number>();
//   private remotePlayers = new Map<string, any>();

//   constructor(name: string) {
//     this.name = name;

//     // PlayroomKit сразу доступен через глобал
//     if (typeof window !== "undefined" && (window as any).Playroom) {
//       this.init();
//     } else {
//       // Fallback для Vite HMR
//       window.addEventListener("load", () => this.init());
//     }
//   }

//   private init() {
//     const Playroom = (window as any).Playroom;

//     Playroom.onPlayerJoin((player: any) => {
//       if (player.id === Playroom.myPlayer()?.id) return;

//       this.remotePlayers.set(player.id, player);

//       player.onQuit(() => {
//         this.leaveListeners.forEach((cb) => cb(player.id));
//         this.remotePlayers.delete(player.id);
//       });

//       player.onStateChange((state: any) => {
//         const remoteState: RemotePlayerState = {
//           id: player.id,
//           name: player.getProfile().name || this.name,
//           anim: state.anim || "idle",
//           flipX: !!state.flipX,
//           x: state.x || 0,
//           y: state.y || 0,
//           coins: state.coins || 0,
//         };
//         this.stateListeners.forEach((cb) => cb(remoteState));
//       });
//     });
//   }

//   onRemoteState(listener: StateListener) {
//     this.stateListeners.push(listener);
//   }
//   onRemoteLeave(listener: LeaveListener) {
//     this.leaveListeners.push(listener);
//   }
//   onCoinPicked(listener: CoinPickedListener) {
//     this.coinPickedListeners.push(listener);
//   }
//   onBossDefeated(listener: BossDefeatedListener) {
//     this.bossDefeatedListeners.push(listener);
//   }

//   sendStateUpdate(state: Omit<RemotePlayerState, "id">) {
//     const Playroom = (window as any).Playroom;
//     Playroom.myPlayer()?.setState(state);
//   }

//   requestCoinPickup(coinId: number) {
//     if (this.pickedCoins.has(coinId)) return;
//     this.pickedCoins.add(coinId);
//     const Playroom = (window as any).Playroom;
//     Playroom.insertCoin({ type: "coinPicked", coinId, by: Playroom.myPlayer()?.id });
//   }

//   announceBossDefeated() {
//     const Playroom = (window as any).Playroom;
//     Playroom.insertCoin({ type: "bossDefeated" });
//   }

//   getPlayersSnapshot() {
//     const Playroom = (window as any).Playroom;
//     const players: Array<{ id: string; name: string; coins: number }> = [];

//     // Собираем из всех игроков
//     Playroom.onPlayerJoin((player: any) => {
//       players.push({
//         id: player.id,
//         name: player.getProfile().name || "Player",
//         coins: player.getState()?.coins || 0,
//       });
//     });

//     return players.sort((a, b) => b.coins - a.coins);
//   }
// }
// LivekitNetworkManager.ts - PlayroomKit wrapper
export type RemotePlayerState = {
  id: string;
  name: string;
  anim: "idle" | "run" | "jump";
  flipX: boolean;
  x: number;
  y: number;
  coins: number;
};

type StateListener = (state: RemotePlayerState) => void;
type LeaveListener = (id: string) => void;
type CoinPickedListener = (coinId: number, by: string) => void;
type BossDefeatedListener = () => void;

export class PlayroomNetworkManager {
  name: string;
  private stateListeners: StateListener[] = [];
  private leaveListeners: LeaveListener[] = [];
  private coinPickedListeners: CoinPickedListener[] = [];
  private bossDefeatedListeners: BossDefeatedListener[] = [];
  private pickedCoins = new Set<number>();

  constructor(name: string) {
    this.name = name;

    // Инициализация ТОЛЬКО когда PlayroomKit готов
    this.waitForPlayroom().then(() => {
      this.setupPlayroom();
    });
  }

  private waitForPlayroom() {
    return new Promise<void>((resolve) => {
      if ((window as any).Playroom) {
        resolve();
        return;
      }

      const check = () => {
        if ((window as any).Playroom) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private setupPlayroom() {
    const Playroom = (window as any).Playroom;

    Playroom.onPlayerJoin((player: any) => {
      if (player.id === Playroom.myPlayer()?.id) return;

      player.onQuit(() => {
        this.leaveListeners.forEach((cb) => cb(player.id));
      });

      player.onStateChange((state: any) => {
        const remoteState: RemotePlayerState = {
          id: player.id,
          name: player.getProfile().name || this.name,
          anim: state.anim || "idle",
          flipX: !!state.flipX,
          x: state.x || 0,
          y: state.y || 0,
          coins: state.coins || 0,
        };
        this.stateListeners.forEach((cb) => cb(remoteState));
      });
    });
  }

  onRemoteState = (listener: StateListener) => this.stateListeners.push(listener);
  onRemoteLeave = (listener: LeaveListener) => this.leaveListeners.push(listener);
  onCoinPicked = (listener: CoinPickedListener) => this.coinPickedListeners.push(listener);
  onBossDefeated = (listener: BossDefeatedListener) => this.bossDefeatedListeners.push(listener);

  sendStateUpdate(state: Omit<RemotePlayerState, "id">) {
    (window as any).Playroom?.myPlayer()?.setState(state);
  }

  requestCoinPickup(coinId: number) {
    if (this.pickedCoins.has(coinId)) return;
    this.pickedCoins.add(coinId);
    (window as any).Playroom?.insertCoin({ type: "coinPicked", coinId, by: (window as any).Playroom?.myPlayer()?.id });
  }

  announceBossDefeated() {
    (window as any).Playroom?.insertCoin({ type: "bossDefeated" });
  }

  getPlayersSnapshot() {
    const Playroom = (window as any).Playroom;
    const players: Array<{ id: string; name: string; coins: number }> = [];
    Playroom?.allPlayers?.()?.forEach((player: any) => {
      players.push({
        id: player.id,
        name: player.getProfile().name || "Player",
        coins: player.getState()?.coins || 0,
      });
    });
    return players.sort((a, b) => b.coins - a.coins);
  }
}
