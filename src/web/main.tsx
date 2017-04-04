import * as ReactDOM from "react-dom";
import * as React from "react";

import { ImageListView } from "./imageList";
import { ControlsView } from "./controlsView";
import { ImageUploadView } from "./imageUpload";

class MainView extends React.Component<{}, {}> {
    public render() {
        return (
            <div>
                <ControlsView />
                <ImageUploadView />
                <ImageListView />
            </div>
        );
    }
}

ReactDOM.render(<MainView />, document.getElementById("container"));