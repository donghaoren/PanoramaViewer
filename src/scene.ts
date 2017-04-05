import { IOmniStereo, GL3 as GL, graphics } from "allofw";
import { Pose, compileShaders } from "allofw-utils";
import { EquirectangularTextureRenderer, ColorRenderer } from "./panorama";

export type StereoMode = "mono" | "top-bottom" | "bottom-top";

export class Scene {
    public omni: IOmniStereo;
    public pose: Pose;

    constructor(omni: IOmniStereo) {
        this.omni = omni;
        this.pose = new Pose();
    }

    public setAlpha(alpha: number) {}
    public render() {}
    public frame(t: number) {}
}

export class PanoramaImageScene extends Scene {
    private texture_panorama: GL.Texture;
    private renderer: EquirectangularTextureRenderer;

    constructor(omni: IOmniStereo, filename: string, stereoMode: StereoMode) {
        super(omni);
        let buffer: Buffer;
        if(filename.startsWith("data:")) {
            buffer = new Buffer(filename.split(",")[1], 'base64');
        } else {
            buffer = require("fs").readFileSync(filename);
        }
        let image = graphics.loadImageData(buffer);
        // Create an OpenGL texture, set parameters.
        let texture_panorama = new GL.Texture();
        GL.bindTexture(GL.TEXTURE_2D, texture_panorama);

        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.REPEAT);  // longitude set to repeat to avoid seam on the border of the image.
        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);   // latitude set to clamp.
        GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, image.width(), image.height(), 0, GL.RGBA, GL.UNSIGNED_BYTE, image.pixels());
        GL.bindTexture(GL.TEXTURE_2D, 0);

        this.renderer = new EquirectangularTextureRenderer(omni, texture_panorama, stereoMode);
    }

    public setAlpha(alpha: number) {
        this.renderer.setAlpha(alpha);
    }

    public render() {
        this.renderer.setPose(this.pose);
        this.renderer.render();
    }
}

export class PanoramaVideoScene extends Scene {
    private texture_panorama: GL.Texture;
    private renderer: EquirectangularTextureRenderer;
    private video: graphics.VideoSurface2D;
    private framerate: number;

    constructor(omni: IOmniStereo, filename: string, stereoMode: StereoMode, framerate: number = 30) {
        super(omni);
        this.video = new graphics.VideoSurface2D(filename);
        this.framerate = framerate;
        // Create an OpenGL texture, set parameters.
        let texture_panorama = new GL.Texture();
        GL.bindTexture(GL.TEXTURE_2D, texture_panorama);

        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.LINEAR);
        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.LINEAR);
        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.REPEAT);  // longitude set to repeat to avoid seam on the border of the image.
        GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);   // latitude set to clamp.
        GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, this.video.width(), this.video.height(), 0, GL.RGBA, GL.UNSIGNED_BYTE, this.video.pixels());
        GL.bindTexture(GL.TEXTURE_2D, 0);

        this.texture_panorama = texture_panorama;

        this.renderer = new EquirectangularTextureRenderer(omni, texture_panorama, stereoMode);
    }

    public upload() {
        GL.bindTexture(GL.TEXTURE_2D, this.texture_panorama);
        GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, this.video.width(), this.video.height(), 0, GL.RGBA, GL.UNSIGNED_BYTE, this.video.pixels());
        GL.bindTexture(GL.TEXTURE_2D, 0);
    }

    public setAlpha(alpha: number) {
        this.renderer.setAlpha(alpha);
    }

    private tStart: number;
    private frameIndex: number;

    public start(t: number) {
        this.frameIndex = 1;
        this.tStart = t;
        this.video.seek(0);
        this.video.nextFrame();
        this.upload();
    }

    public frame(t: number) {
        let frameDesired = (t - this.tStart) * this.framerate / 1000;
        let changed = false;
        while(this.frameIndex < frameDesired) {
            this.video.nextFrame();
            this.frameIndex += 1;
            changed = true;
        }
        if(changed) {
            this.upload();
        }
    }

    public render() {
        this.renderer.setPose(this.pose);
        this.renderer.render();
    }
}


export class MessageScene extends Scene {
    private program: GL.Program;
    private vertexArray: GL.VertexArray;
    private buffer: GL.Buffer;
    private surface: graphics.Surface2D;
    private alpha: number;
    private color: ColorRenderer;

    public setMessages(messages: {
        message: string;
        color?: [number, number, number, number];
        fontSize?: number;
    }[]) {
        let context: graphics.GraphicalContext2D = new graphics.GraphicalContext2D(this.surface);
        context.clear(0, 0, 0, 0);
        let paint = context.paint();
        paint.setMode(graphics.PAINTMODE_FILL);
        this.color = new ColorRenderer(this.omni, 0, 0, 0);

        let offset = 180;
        for (let m of messages) {
            let fontSize = m.fontSize != null ? m.fontSize : 48;
            paint.setTextSize(fontSize);
            if (m.color != null) {
                paint.setColor(m.color[0], m.color[1], m.color[2], m.color[3]);
            } else {
                paint.setColor(255, 255, 255, 1);
            }
            let width = paint.measureText(m.message);
            context.drawText(m.message, (1200 - width) / 2, offset, paint);
            offset += m.fontSize + 20;
        }
        context.flush();
        this.surface.uploadTexture();
    }

    constructor(omni: IOmniStereo, parameter: string | {
        message: string;
        color?: [number, number, number, number];
        fontSize?: number;
    }[]) {
        super(omni);
        let messages: {
            message: string;
            color?: [number, number, number, number];
            fontSize?: number;
        }[] = [];

        if(typeof(parameter) == "string") {
            messages = [ { message: parameter, color: [ 255, 255, 255, 1 ], fontSize: 24 } ];
        } else {
            messages = parameter;
        }

        this.surface = new graphics.Surface2D(1200, 400, graphics.SURFACETYPE_RASTER);
        this.alpha = 1;

        this.setMessages(messages);

        var program = compileShaders({
            vertex: "#version 330\n" + omni.getShaderCode() + `
                layout(location = 0) in vec3 position;
                layout(location = 1) in vec2 texCoord;

                uniform vec3 pose_position;
                uniform vec4 pose_rotation;
                uniform float pose_scale;

                out vec2 voTexCoord;

                void main() {
                    voTexCoord = vec2(texCoord.x, 1 - texCoord.y);
                    vec3 p = omni_quat_rotate(pose_rotation, position * pose_scale) + pose_position;
                    gl_Position = omni_render(omni_transform(p));
                }
            `,
            fragment: "#version 330\n" + omni.getShaderCode() + `
                in vec2 voTexCoord;

                layout(location = 0) out vec4 foFragmentColor;

                uniform sampler2D texImage;
                uniform float uAlpha;

                void main() {
                    foFragmentColor = texture(texImage, voTexCoord) * uAlpha;
                }
            `,
            geometry: null
        });

        this.program = program;

        let s = 4;
        let vertexData = new Float32Array([
            -1.2 * s, -0.4 * s, -5, 0, 0,
            -1.2 * s, +0.4 * s, -5, 0, 1,
            +1.2 * s, -0.4 * s, -5, 1, 0,
            +1.2 * s, +0.4 * s, -5, 1, 1,
            +1.2 * s, -0.4 * s, +5, 0, 0,
            +1.2 * s, +0.4 * s, +5, 0, 1,
            -1.2 * s, -0.4 * s, +5, 1, 0,
            -1.2 * s, +0.4 * s, +5, 1, 1
        ]);

        let buffer = new GL.Buffer();
        let array = new GL.VertexArray();

        GL.bindBuffer(GL.ARRAY_BUFFER, buffer);
        GL.bufferData(GL.ARRAY_BUFFER, vertexData.length * 4, vertexData, GL.STATIC_DRAW);

        GL.bindVertexArray(array);

        GL.enableVertexAttribArray(0);
        GL.enableVertexAttribArray(1);
        GL.vertexAttribPointer(0, 3, GL.FLOAT, GL.FALSE, 20, 0);
        GL.vertexAttribPointer(1, 2, GL.FLOAT, GL.FALSE, 20, 12);
        GL.bindVertexArray(0);

        GL.bindBuffer(GL.ARRAY_BUFFER, 0);


        GL.useProgram(program);
        GL.uniform1i(GL.getUniformLocation(program, "texImage"), 0);
        GL.useProgram(0);

        this.vertexArray = array;
        this.buffer = buffer;
    }

    public setAlpha(alpha: number) {
        this.color.setAlpha(alpha);
        this.alpha = alpha;
    }

    public setPose(pose: Pose) {
        // Stick to the original pose
    }

    public render() {
        this.color.render();
        GL.useProgram(this.program);
        this.omni.setUniforms(this.program.id());
        GL.bindVertexArray(this.vertexArray);

        GL.uniform3f(GL.getUniformLocation(this.program, "pose_position"), this.pose.position.x, this.pose.position.y, this.pose.position.z);
        GL.uniform4f(GL.getUniformLocation(this.program, "pose_rotation"), this.pose.rotation.v.x, this.pose.rotation.v.y, this.pose.rotation.v.z, this.pose.rotation.w);
        GL.uniform1f(GL.getUniformLocation(this.program, "pose_scale"), this.pose.scale);
        GL.uniform1f(GL.getUniformLocation(this.program, "uAlpha"), this.alpha);

        this.surface.bindTexture(0);

        GL.drawArrays(GL.TRIANGLE_STRIP, 0, 4);
        GL.drawArrays(GL.TRIANGLE_STRIP, 4, 8);

        this.surface.unbindTexture(0);

        GL.bindVertexArray(0);
        GL.useProgram(0);
    }
}

export class BlankScene extends Scene {
    private renderer: ColorRenderer;

    constructor(omni: IOmniStereo, r: number, g: number, b: number) {
        super(omni);
        this.renderer = new ColorRenderer(omni, r, g, b);
    }

    public setAlpha(alpha: number) {
        this.renderer.setAlpha(alpha);
    }

    public render() {
        this.renderer.render();
    }
}

