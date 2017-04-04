import { IOmniStereo, GL3 as GL, graphics } from "allofw";
import { Pose, compileShaders } from "allofw-utils";

export type StereoMode = "mono" | "top-bottom" | "bottom-top";

export function makeSphere(radius: number = 1, subdivide: number = 5) {
    // Vertices for a icosahedron.
    let t = (1.0 + Math.sqrt(5.0)) / 2.0;
    let vertices = [
        [-1,  t,  0],
        [ 1,  t,  0],
        [-1, -t,  0],
        [ 1, -t,  0],
        [ 0, -1,  t],
        [ 0,  1,  t],
        [ 0, -1, -t],
        [ 0,  1, -t],
        [ t,  0, -1],
        [ t,  0,  1],
        [-t,  0, -1],
        [-t,  0,  1]
    ];
    let faces = [
        [ 0, 11,  5], [ 0,  5,  1], [ 0,  1,  7], [ 0,  7, 10],
        [ 0, 10, 11], [ 1,  5,  9], [ 5, 11,  4], [11, 10,  2],
        [10,  7,  6], [ 7,  1,  8], [ 3,  9,  4], [ 3,  4,  2],
        [ 3,  2,  6], [ 3,  6,  8], [ 3,  8,  9], [ 4,  9,  5],
        [ 2,  4, 11], [ 6,  2, 10], [ 8,  6,  7], [ 9,  8,  1]
    ];
    // Make a triangle list.
    let pointer = 0;
    let subdivided_triangles = [];
    let interp2 = function(v0: number[], v1: number[], t: number) {
        return [
            v0[0] * (1 - t) + v1[0] * t,
            v0[1] * (1 - t) + v1[1] * t,
            v0[2] * (1 - t) + v1[2] * t,
        ];
    };
    let interp = function(v0: number[], v1: number[], v2: number[], t1: number, t2: number) {
        return interp2(interp2(v0, v1, t1), interp2(v0, v2, t1), t2);
    };
    let normalize = function(v: number[]) {
        let len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return [ v[0] / len * radius, v[1] / len * radius, v[2] / len * radius ];
    };
    for(let f of faces) {
        let v0 = vertices[f[0]];
        let v1 = vertices[f[1]];
        let v2 = vertices[f[2]];
        for(let i = 0; i < subdivide; i++) {
            for(let j = 0; j <= i; j++) {
                subdivided_triangles.push([
                    normalize(interp(v0, v1, v2, i / subdivide, i == 0 ? 0 : j / i)),
                    normalize(interp(v0, v1, v2, (i + 1) / subdivide, j / (i + 1))),
                    normalize(interp(v0, v1, v2, (i + 1) / subdivide, (j + 1) / (i + 1)))
                ]);
                if(j < i) {
                    subdivided_triangles.push([
                        normalize(interp(v0, v1, v2, i / subdivide, j / i)),
                        normalize(interp(v0, v1, v2, (i + 1) / subdivide, (j + 1) / (i + 1))),
                        normalize(interp(v0, v1, v2, i / subdivide, (j + 1) / i))
                    ]);
                }
            }
        }
    }
    return subdivided_triangles;
};

export interface ISphereMesh {
    vertexArray: GL.VertexArray;
    vertexBuffer: GL.Buffer;
    render: () => void;
}

export function makeSphereMesh(radius: number = 1, subdivide: number = 5): ISphereMesh {
    let triangles = makeSphere(radius, subdivide);
    let buffer = new Float32Array(triangles.length * 3 * 3);
    let ptr = 0;
    for(let i = 0; i < triangles.length; i++) {
        for(let a = 0; a < 3; a++) {
            for(let b = 0; b < 3; b++) {
                buffer[ptr++] = triangles[i][a][b];
            }
        }
    }
    let vertex_buffer = new GL.Buffer();
    let vertex_array = new GL.VertexArray();
    GL.bindBuffer(GL.ARRAY_BUFFER, vertex_buffer);
    GL.bufferData(GL.ARRAY_BUFFER, buffer.length * 4, buffer, GL.STATIC_DRAW);
    GL.bindVertexArray(vertex_array);
    GL.enableVertexAttribArray(0);
    GL.bindBuffer(GL.ARRAY_BUFFER, vertex_buffer);
    GL.vertexAttribPointer(0, 3, GL.FLOAT, GL.FALSE, 12, 0);
    GL.bindVertexArray(0);
    GL.bindBuffer(GL.ARRAY_BUFFER, 0);
    let vertex_count = triangles.length * 3;
    return {
        vertexArray: vertex_array,
        vertexBuffer: vertex_buffer,
        render: function() {
            GL.bindVertexArray(vertex_array);
            GL.drawArrays(GL.TRIANGLES, 0, vertex_count);
            GL.bindVertexArray(0);
        }
    };
};

export class EquirectangularTextureRenderer {
    private texture: GL.Texture;
    private program: GL.Program;
    private sphere: ISphereMesh;
    private omni: IOmniStereo;
    private alpha: number;
    private pose: Pose;

    constructor(omni: IOmniStereo, texture: GL.Texture, stereoMode: StereoMode) {
        this.omni = omni;
        this.pose = new Pose();

        let stereoAddresser = "vec2(0, 0)";
        switch(stereoMode) {
            case "mono": {
                stereoAddresser = `vec2(-lng / PI / 2.0 + 0.5, -lat / PI + 0.5)`;
            } break;
            case "top-bottom": {
                stereoAddresser = `vec2(-lng / PI / 2.0 + 0.5, -lat / PI / 2.0 + 0.25 + (omni_eye > 0.0 ? 0.5 : 0))`;
            } break;
        }

        let program = compileShaders({
            vertex: "#version 330\n" + omni.getShaderCode() + `
                layout(location = 0) in vec3 position;
                out vec3 vo_position;

                uniform vec3 pose_position;
                uniform vec4 pose_rotation;
                uniform float pose_scale;

                void main() {
                    vec3 p = omni_quat_rotate(pose_rotation, position * pose_scale) + pose_position;
                    gl_Position = omni_project(omni_transform(p));
                    vo_position = position;
                }
            `,
            fragment: "#version 330\n" + omni.getShaderCode() + `
                #define PI 3.1415926535897932
                in vec3 vo_position;
                uniform sampler2D texImage;
                uniform float uAlpha;
                layout(location = 0) out vec4 fragment_color;
                void main() {
                    // Compute lng, lat from the 3D position.
                    vec3 position = normalize(vo_position);
                    float lng = atan(position.x, position.z);
                    float lat = atan(position.y, length(position.xz));
                    // You can play with distrotion here by changing lat, lng.

                    fragment_color = vec4(texture(texImage, ${stereoAddresser}).rgb * uAlpha, uAlpha);
                }
            `,
            geometry: null
        });

        // Uniform set to 1.
        GL.useProgram(program);
        GL.uniform1i(GL.getUniformLocation(program, "texImage"), 0);
        GL.uniform1f(GL.getUniformLocation(program, "uAlpha"), 1);
        GL.useProgram(0);

        // Make the cube. We render the earth on a cube surface.
        let sphere = makeSphereMesh(5, 20);

        this.sphere = sphere;
        this.texture = texture;
        this.program = program;
        this.alpha = 1;
    }

    public setAlpha(alpha: number) {
        this.alpha = alpha;
    }

    public setPose(pose: Pose) {
        this.pose = pose;
    }

    public render() {
        // Use the main program.
        GL.useProgram(this.program);
        GL.uniform3f(GL.getUniformLocation(this.program, "pose_position"), this.pose.position.x, this.pose.position.y, this.pose.position.z);
        GL.uniform4f(GL.getUniformLocation(this.program, "pose_rotation"), this.pose.rotation.v.x, this.pose.rotation.v.y, this.pose.rotation.v.z, this.pose.rotation.w);
        GL.uniform1f(GL.getUniformLocation(this.program, "pose_scale"), this.pose.scale);
        GL.uniform1f(GL.getUniformLocation(this.program, "uAlpha"), this.alpha);
        // Set omnistereo uniforms (pose, eye separation, etc.)
        this.omni.setUniforms(this.program.id());
        // Use the earth texture.
        GL.bindTexture(GL.TEXTURE_2D, this.texture);
        // Use the cube's vertex array.
        this.sphere.render();
        // Cleanup.
        GL.bindTexture(GL.TEXTURE_2D, 0);
        GL.useProgram(0);
    }
}

export class ColorRenderer {
    private program: GL.Program;
    private sphere: ISphereMesh;
    private omni: IOmniStereo;
    private alpha: number;

    constructor(omni: IOmniStereo, r: number, g: number, b: number) {
        this.omni = omni;

        let program = compileShaders({
            vertex: "#version 330\n" + omni.getShaderCode() + `
                layout(location = 0) in vec3 position;
                out vec3 vo_position;
                void main() {
                    gl_Position = omni_render(omni_transform(position));
                }
            `,
            fragment: "#version 330\n" + omni.getShaderCode() + `
                uniform vec3 uColor;
                uniform float uAlpha;
                layout(location = 0) out vec4 fragment_color;
                void main() {
                    fragment_color = vec4(uColor * uAlpha, uAlpha);
                }
            `,
            geometry: null
        });

        // Uniform set to 1.
        GL.useProgram(program);
        GL.uniform3f(GL.getUniformLocation(program, "uColor"), r, g, b);
        GL.uniform1f(GL.getUniformLocation(program, "uAlpha"), 1);
        GL.useProgram(0);

        // Make the cube. We render the earth on a cube surface.
        let sphere = makeSphereMesh(5, 20);

        this.sphere = sphere;
        this.program = program;
        this.alpha = 1;
    }

    public setAlpha(alpha: number) {
        this.alpha = alpha;
    }

    public render() {
        // Use the main program.
        GL.useProgram(this.program);
        GL.uniform1f(GL.getUniformLocation(this.program, "uAlpha"), this.alpha);
        // Set omnistereo uniforms (pose, eye separation, etc.)
        this.omni.setUniforms(this.program.id());
        // Use the cube's vertex array.
        this.sphere.render();
        GL.useProgram(0);
    }
}
