declare let server: {
    message: (path: string, ...args: any[]) => void;
    on: (path: string, callback: (...args: any[]) => void) => void;
    rpc: (path: string, ...args: any[]) => Promise<any>;
};
