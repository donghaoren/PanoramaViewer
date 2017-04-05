import * as React from "react";
import * as ReactDOM from "react-dom";

export class LevelButtons extends React.Component<{
    onReset: () => void;
    onLevel: (level: number) => void;
}, {}> {
    public down(value: number) {
        this.props.onLevel(value);
        let onup = () => {
            window.removeEventListener("mouseup", onup);
            this.props.onLevel(0);
        };
        window.addEventListener("mouseup", onup);
    }
    public tdown(e: any, value: number) {
        e.preventDefault();
        this.props.onLevel(value);
        let onup = () => {
            window.removeEventListener("touchend", onup);
            this.props.onLevel(0);
        };
        window.addEventListener("touchend", onup);
    }
    public render() {
        return (
            <span className="level-buttons">
                <button onTouchStart={(e) => this.tdown(e, -10)} onMouseDown={() => this.down(-10)}>-10</button>
                <button onTouchStart={(e) => this.tdown(e, -5)} onMouseDown={() => this.down(-5)}>-5</button>
                <button onTouchStart={(e) => this.tdown(e, -2)} onMouseDown={() => this.down(-2)}>-2</button>
                <button onTouchStart={(e) => this.tdown(e, -1)} onMouseDown={() => this.down(-1)}>-1</button>
                <button onClick={() => this.props.onReset()}>RESET</button>
                <button onTouchStart={(e) => this.tdown(e, +1)} onMouseDown={() => this.down(+1)}>+1</button>
                <button onTouchStart={(e) => this.tdown(e, +2)} onMouseDown={() => this.down(+2)}>+2</button>
                <button onTouchStart={(e) => this.tdown(e, +5)} onMouseDown={() => this.down(+5)}>+5</button>
                <button onTouchStart={(e) => this.tdown(e, +10)} onMouseDown={() => this.down(+10)}>+10</button>
            </span>
        );
    }
}

export class ControlsView extends React.Component<{}, {}> {
    constructor(props: {}) {
        super(props);

        this.state = {
            yawValue: 500,
            pitchValue: 500,
            rollValue: 500
        };
    }

    public render() {
        return (
            <div className="controls-view">
                <p><label>Yaw:</label> <LevelButtons onReset={() => server.message("pose", "reset", "yaw")} onLevel={(value) => server.message("pose", "level", "yaw", value)} /></p>
                <p><label>Pitch:</label> <LevelButtons onReset={() => server.message("pose", "reset", "pitch")} onLevel={(value) => server.message("pose", "level", "pitch", value)} /></p>
                <p><label>Roll:</label> <LevelButtons onReset={() => server.message("pose", "reset", "roll")} onLevel={(value) => server.message("pose", "level", "roll", value)} /></p>
            </div>
        );
    }
}
