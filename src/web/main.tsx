import * as ReactDOM from "react-dom";
import * as React from "react";

import { ImageListView } from "./imageList";
import { VideoListView } from "./videoList";
import { ControlsView } from "./controlsView";
import { ImageUploadView } from "./imageUpload";

class MainView extends React.Component<{}, {}> {
    public render() {
        return (
            <div>
                <h2>Controls</h2>
                <ControlsView />
                <h2>Upload Image</h2>
                <ImageUploadView />
                <h2>Select Image</h2>
                <ImageListView />
                <h2>Select Video</h2>
                <VideoListView />
            </div>
        );
    }
}

ReactDOM.render(<MainView />, document.getElementById("container"));