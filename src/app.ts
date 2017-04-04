import * as fs from "fs";
import * as path from "path";
import { GL3 as GL, graphics } from "allofw";
import { IRendererRuntime, WindowNavigation, Vector3, Quaternion, Pose, ISimulatorRuntime } from "allofw-utils";
import { StereoMode, Scene, PanoramaImageScene, PanoramaVideoScene, MessageScene, BlankScene } from "./scene";

export interface RendererConfig {
    searchPaths?: string[];
}

function resolveFile(filename: string, searchPaths?: string[]) {
    // Data urls are kept as is
    if(filename.startsWith("data:")) return filename;
    // Look for file in search paths
    if (searchPaths) {
        for (let p of searchPaths) {
            let resolved = path.join(p, filename);
            if (fs.existsSync(resolved)) {
                return resolved;
            }
        }
    }
    // Check the OS exists
    if (fs.existsSync(filename)) return filename;
    return null;
}

export class Renderer {
    app: IRendererRuntime;
    nav: WindowNavigation;
    config: RendererConfig;

    thisScene: Scene;
    nextScene: Scene;
    blendFactor: number;

    constructor(app: IRendererRuntime) {
        this.app = app;

        if (true) {
            this.nav = new WindowNavigation(app.window, app.omni);
        }

        this.config = {};

        this.app.networking.on("config", this.onConfig.bind(this));
        this.app.networking.on("loadImage", this.onLoadImage.bind(this));
        this.app.networking.on("loadVideo", this.onLoadVideo.bind(this));
        this.app.networking.on("loadMessage", this.onLoadMessage.bind(this));
        this.app.networking.on("nextFrame", this.onNextFrame.bind(this));
        this.app.networking.on("present", this.onPresent.bind(this));
        this.app.networking.on("loadColor", this.onLoadColor.bind(this));

        this.thisScene = null;
        this.nextScene = null;
    }

    onConfig(config: RendererConfig) {
        this.config = config;
    }

    onLoadImage(filename: string, stereoMode: StereoMode) {
        filename = resolveFile(filename, this.config.searchPaths);
        if (filename) {
            this.makeNextScene(new PanoramaImageScene(this.app.omni, filename, stereoMode));
        } else {
            this.makeNextScene(new MessageScene(this.app.omni, `cannot open ${filename}`));
        }
    }

    onLoadVideo(filename: string, stereoMode: StereoMode) {
        filename = resolveFile(filename, this.config.searchPaths);
        if (filename) {
            this.makeNextScene(new PanoramaVideoScene(this.app.omni, filename, stereoMode));
        } else {
            this.makeNextScene(new MessageScene(this.app.omni, `cannot open ${filename}`));
        }
    }

    onLoadMessage(message: string) {
        this.makeNextScene(new MessageScene(this.app.omni, message));
    }

    onLoadColor(r: number, g: number, b: number) {
        this.makeNextScene(new BlankScene(this.app.omni, r, g, b));
    }

    onNextFrame() {
        this.thisScene.nextFrame();
    }

    onPresent(blendFactor: number, finished: boolean) {
        if (finished) {
            this.thisScene = this.nextScene;
            this.nextScene = null;
            this.blendFactor = 0;
        } else {
            this.blendFactor = blendFactor;
        }
    }

    public makeNextScene(scene: Scene) {
        if(this.nextScene != null) this.thisScene = this.nextScene;
        this.nextScene = scene;
        this.blendFactor = 0;
    }

    public frame() {
        if (this.nav) {
            this.nav.update();
        }
    }

    public render() {
        GL.clearColor(0, 0, 0, 1);
        // GL.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
        GL.enable(GL.BLEND);
        GL.disable(GL.DEPTH_TEST);
        GL.blendFunc(GL.ONE, GL.ONE_MINUS_SRC_ALPHA);

        if(this.thisScene) {
            this.thisScene.setAlpha(1);
            this.thisScene.render();
        }

        if(this.nextScene) {
            this.nextScene.setAlpha(this.blendFactor);
            this.nextScene.render();
        }

        GL.enable(GL.DEPTH_TEST);
        GL.disable(GL.BLEND);
    }
}

function delay(time: number): () => Promise<void> {
    return () => new Promise<void>((resolve, reject) => {
        setTimeout(resolve, time);
    });
}

export class Simulator {
    app: ISimulatorRuntime;
    actions: Promise<void>;
    renderers: Set<string>;

    constructor(app: ISimulatorRuntime) {
        this.app = app;
        this.actions = null;

        app.server.on("loadImage", this.loadImage.bind(this));
        app.server.on("loadColor", this.loadColor.bind(this));
        app.server.on("loadMessage", this.loadMessage.bind(this));

        app.server.rpc("getImages", this.getImages.bind(this));
        app.server.rpc("getThumbnail", this.getThumbnail.bind(this));

        this.renderers = new Set<string>();
        app.networking.on("start", (name: string) => {
            setTimeout(() => {
                this.app.networking.broadcast("config", this.app.config);
            }, 1000);
        });

        app.server.addStatic("/web", "dist/web");
    }

    public getImages(): { filename: string, dirname: string, stereoMode: string }[] {
        let paths = (this.app.config as RendererConfig).searchPaths;
        let result: { filename: string, dirname: string, stereoMode: string }[] = [];
        paths.forEach(p => {
            let items = fs.readdirSync(p);
            items.forEach(x => {
                let extension = path.extname(x).toLowerCase();
                if(extension == ".jpg" || extension == ".jpeg" || extension == ".png") {
                    result.push({
                        filename: x,
                        dirname: p,
                        stereoMode: "mono"
                    });
                }
            });
        });
        return result;
    }

    public getThumbnail(filename: string): string {
        let resolved = resolveFile(filename, (this.app.config as RendererConfig).searchPaths);
        if(!resolved) return null;
        let thumbnailPath = resolved + ".thumbnail";
        if(!fs.existsSync(thumbnailPath)) {
            let img = graphics.loadImageData(fs.readFileSync(resolved));
            let smaller = new graphics.Surface2D(400, Math.round(400 / img.width() * img.height()), graphics.SURFACETYPE_RASTER);
            let canvas = new graphics.GraphicalContext2D(smaller);
            canvas.drawSurface(img,
                0, 0, img.width(), img.height(),
                0, 0, smaller.width(), smaller.height(),
                canvas.paint());
            smaller.save(thumbnailPath);
        }
        let dataurl = "data:image/png;base64," + fs.readFileSync(thumbnailPath).toString("base64");
        return dataurl;
    }

    public pushAction(action: () => Promise<void>) {
        if(this.actions == null) {
            this.actions = action();
        } else {
            this.actions = this.actions.then(action);
        }
    }

    public barrier(timeout: number = 10000) {
        this.pushAction(() => this.app.networking.barrier(timeout));
    }

    public loadImage(filename: string, stereoMode: StereoMode) {
        this.pushAction(() => new Promise<void>((resolve, reject) => {
            this.app.networking.broadcast("loadImage", filename, stereoMode);
            console.log("loadImage", filename, stereoMode);
            resolve();
        }));
        this.barrier();
        this.present();
    }

    public loadColor(r: number, g: number, b: number) {
        this.pushAction(() => new Promise<void>((resolve, reject) => {
            this.app.networking.broadcast("loadColor", r, g, b);
            console.log("loadColor", r, g, b);
            resolve();
        }));
        this.present();
    }

    public loadMessage(text: string) {
        this.pushAction(() => new Promise<void>((resolve, reject) => {
            this.app.networking.broadcast("loadMessage", text);
            console.log("loadMessage", text);
            resolve();
        }));
        this.present();
    }

    public present() {
        this.pushAction(() => new Promise<void>((resolve, reject) => {
            let t = new Date().getTime();
            let duration = 1000;
            let interval = setInterval(() => {
                let t1 = new Date().getTime();
                let dt = t1 - t;
                if(dt >= duration) {
                    this.app.networking.broadcast("present", 1, true);
                    clearInterval(interval);
                    resolve();
                } else {
                    this.app.networking.broadcast("present", dt / duration, false);
                }
            }, 10);
        }));
    }
}

export let simulator = Simulator;
export let renderer = Renderer;
