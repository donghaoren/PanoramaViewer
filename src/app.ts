import * as fs from "fs";
import * as path from "path";
import { GL3 as GL, graphics } from "allofw";
import { IRendererRuntime, WindowNavigation, Vector3, Quaternion, Pose, ISimulatorRuntime } from "allofw-utils";
import { StereoMode, Scene, PanoramaImageScene, PanoramaVideoScene, MessageScene, BlankScene } from "./scene";
import * as yaml from "js-yaml";

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
    pose: Pose;

    thisScene: Scene;
    nextScene: Scene;
    blendFactor: number;

    constructor(app: IRendererRuntime) {
        this.app = app;
        this.pose = new Pose();

        if (true) {
            this.nav = new WindowNavigation(app.window, app.omni);
        }

        this.config = {};

        this.app.networking.on("config", this.onConfig.bind(this));
        this.app.networking.on("loadImage", this.onLoadImage.bind(this));
        this.app.networking.on("loadVideo", this.onLoadVideo.bind(this));
        this.app.networking.on("loadMessage", this.onLoadMessage.bind(this));
        this.app.networking.on("present", this.onPresent.bind(this));
        this.app.networking.on("loadColor", this.onLoadColor.bind(this));
        this.app.networking.on("pose", this.onPose.bind(this));

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

    onLoadVideo(filename: string, stereoMode: StereoMode, framerate: number, timestamp: number) {
        filename = resolveFile(filename, this.config.searchPaths);
        if (filename) {
            let video = new PanoramaVideoScene(this.app.omni, filename, stereoMode, framerate);
            this.makeNextScene(video);
            video.start(timestamp);
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

    onPresent(blendFactor: number, finished: boolean) {
        if (finished) {
            this.thisScene = this.nextScene;
            this.nextScene = null;
            this.blendFactor = 0;
        } else {
            this.blendFactor = blendFactor;
        }
    }

    onPose(yaw: number, pitch: number, roll: number, timestamp: number) {
        let q = new Quaternion();
	    let t0 = Math.cos(yaw * 0.5);
	    let t1 = Math.sin(yaw * 0.5);
	    let t2 = Math.cos(roll * 0.5);
	    let t3 = Math.sin(roll * 0.5);
	    let t4 = Math.cos(pitch * 0.5);
	    let t5 = Math.sin(pitch * 0.5);

	    q.w = t0 * t2 * t4 + t1 * t3 * t5;
	    q.v.z = t0 * t3 * t4 - t1 * t2 * t5;
	    q.v.x = t0 * t2 * t5 + t1 * t3 * t4;
	    q.v.y = t1 * t2 * t4 - t0 * t3 * t5;
	    this.pose.rotation = q;
        if(this.thisScene) {
            this.thisScene.frame(timestamp);
        }
        if(this.nextScene) {
            this.nextScene.frame(timestamp);
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
            this.thisScene.pose = this.pose;
            this.thisScene.render();
        }

        if(this.nextScene) {
            this.nextScene.setAlpha(this.blendFactor);
            this.nextScene.pose = this.pose;
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

    pose: {
        yaw: number;
        yawSpeed: number;
        pitch: number;
        pitchSpeed: number;
        roll: number;
        rollSpeed: number;
    };

    constructor(app: ISimulatorRuntime) {
        this.app = app;
        this.actions = null;
        this.pose = {
            yaw: 0,
            yawSpeed: 0,
            pitch: 0,
            pitchSpeed: 0,
            roll: 0,
            rollSpeed: 0
        };

        app.server.on("loadImage", this.loadImage.bind(this));
        app.server.on("loadVideo", this.loadVideo.bind(this));
        app.server.on("loadColor", this.loadColor.bind(this));
        app.server.on("loadMessage", this.loadMessage.bind(this));
        app.server.on("pose", this.onPose.bind(this));

        app.server.rpc("getImages", this.getImages.bind(this));
        app.server.rpc("getVideos", this.getVideos.bind(this));
        app.server.rpc("getThumbnail", this.getThumbnail.bind(this));

        this.renderers = new Set<string>();
        app.networking.on("start", (name: string) => {
            setTimeout(() => {
                this.app.networking.broadcast("config", this.app.config);
            }, 1000);
        });

        app.server.addStatic("/web", "dist/web");

        setInterval(() => {
            this.onFrame();
        }, 5);
    }

    public getImages(): { filename: string, dirname: string, stereoMode: string }[] {
        let paths = (this.app.config as RendererConfig).searchPaths;
        let result: { filename: string, dirname: string, stereoMode: string }[] = [];
        paths.forEach(p => {
            try {
                let manifestFile = path.join(p, "panoramas.manifest");
                let manifest: { [ name: string ] : string } = {};
                if(fs.existsSync(manifestFile)) {
                    manifest = yaml.load(fs.readFileSync(manifestFile, "utf-8"));
                }
                let items = fs.readdirSync(p);
                items.forEach(x => {
                    let extension = path.extname(x).toLowerCase();
                    if(extension == ".jpg" || extension == ".jpeg" || extension == ".png") {
                        if(manifest[x] == "ignore") return;
                        result.push({
                            filename: x,
                            dirname: p,
                            stereoMode: manifest[x] ? manifest[x] : "mono"
                        });
                    }
                });
            } catch(e) {
            }
        });
        return result;
    }

    public getVideos(): { filename: string, dirname: string, stereoMode: string, framerate: number }[] {
        let paths = (this.app.config as RendererConfig).searchPaths;
        let result: { filename: string, dirname: string, stereoMode: string, framerate: number }[] = [];
        paths.forEach(p => {
            try {
                let manifestFile = path.join(p, "panoramas.manifest");
                let manifest: { [ name: string ] : [ string, number ] } = {};
                if(fs.existsSync(manifestFile)) {
                    manifest = yaml.load(fs.readFileSync(manifestFile, "utf-8"));
                }
                let items = fs.readdirSync(p);
                items.forEach(x => {
                    let extension = path.extname(x).toLowerCase();
                    if(extension == ".mp4" || extension == ".mov" || extension == ".mpeg") {
                        if(manifest[x] && manifest[x][0] == "ignore") return;
                        result.push({
                            filename: x,
                            dirname: p,
                            stereoMode: manifest[x] ? manifest[x][0] : "mono",
                            framerate: manifest[x] ? manifest[x][1] : 30
                        });
                    }
                });
            } catch(e) {
            }
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

    public onPose(action: string, direction: string, value: number) {
        if(action == "reset") {
            switch(direction) {
                case "yaw": {
                    this.pose.yaw = 0;
                    this.pose.yawSpeed = 0;
                } break;
                case "pitch": {
                    this.pose.pitch = 0;
                    this.pose.pitchSpeed = 0;
                } break;
                case "roll": {
                    this.pose.roll = 0;
                    this.pose.rollSpeed = 0;
                } break;
            }
        }
        if(action == "level") {
            switch(direction) {
                case "yaw": {
                    this.pose.yawSpeed = value;
                } break;
                case "pitch": {
                    this.pose.pitchSpeed = value;
                } break;
                case "roll": {
                    this.pose.rollSpeed = value;
                } break;
            }
        }
    }

    public onFrame() {
        this.pose.yaw += this.pose.yawSpeed * 0.01 / 10;
        this.pose.pitch += this.pose.pitchSpeed * 0.01 / 10;
        this.pose.roll += this.pose.rollSpeed * 0.01 / 10;
        this.app.networking.broadcast("pose", this.pose.yaw, this.pose.pitch, this.pose.roll, new Date().getTime());
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
            resolve();
        }));
        this.barrier();
        this.present();
    }

    public loadVideo(filename: string, stereoMode: StereoMode, framerate: number) {
        this.pushAction(() => new Promise<void>((resolve, reject) => {
            this.app.networking.broadcast("loadVideo", filename, stereoMode, framerate, new Date().getTime() + 200);
            resolve();
        }));
        this.barrier();
        this.present();
    }

    public loadColor(r: number, g: number, b: number) {
        this.pushAction(() => new Promise<void>((resolve, reject) => {
            this.app.networking.broadcast("loadColor", r, g, b);
            resolve();
        }));
        this.present();
    }

    public loadMessage(text: string) {
        this.pushAction(() => new Promise<void>((resolve, reject) => {
            this.app.networking.broadcast("loadMessage", text);
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
            }, 5);
        }));
    }
}

export let simulator = Simulator;
export let renderer = Renderer;
