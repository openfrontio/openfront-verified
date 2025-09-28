// Wallet state manager for non-React components

// Wallet state manager for non-React components
export class WalletManager {
  private static instance: WalletManager;
  private _address: string | undefined;
  private _authenticated: boolean = false;
  private listeners: Set<(state: WalletState) => void> = new Set();

  static getInstance(): WalletManager {
    if (!WalletManager.instance) {
      WalletManager.instance = new WalletManager();
    }
    return WalletManager.instance;
  }

  updateState(state: WalletState) {
    this._address = state.address;
    this._authenticated = state.authenticated;
    this.notifyListeners(state);
  }

  get address(): string | undefined {
    return this._address;
  }

  get authenticated(): boolean {
    return this._authenticated;
  }

  subscribe(listener: (state: WalletState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(state: WalletState) {
    this.listeners.forEach((listener) => listener(state));
  }
}

export interface WalletState {
  address?: string;
  authenticated: boolean;
  user?: any;
}
