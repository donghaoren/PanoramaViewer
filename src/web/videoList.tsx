import * as React from "react";
import * as ReactDOM from "react-dom";
import { orderFiles } from "./utils";

export interface IVideoInfo {
    filename: string;
    dirname: string;
    stereoMode: string;
    framerate: number;
    thumbnail?: string;
}

export class VideoListView extends React.Component<{}, {
    list: IVideoInfo[];
}> {
    constructor(props: {}) {
        super(props);

        this.state = { list: [] };

        server.rpc("getVideos").then((list: IVideoInfo[]) => {
            // for(let l of list) {
            //     server.rpc("getThumbnail", l.dirname + "/" + l.filename).then((dataurl) => {
            //         l.thumbnail = dataurl;
            //         this.setState({ list: this.state.list });
            //     });
            // }
            this.setState({ list: list });
        });
    }

    public loadVideo(img: IVideoInfo) {
        server.message("loadVideo", img.dirname + "/" + img.filename, img.stereoMode, img.framerate);
    }

    public render() {
        return (
            <div className="image-list-view">
                {orderFiles(this.state.list).map((list, idx) => (
                    <div className="files" key={`f${idx}`}>
                        <h3>{list.dirname}</h3>
                        <p>
                            {list.files.map((l, index) => (
                                <a id="item" key={`img-${index}`} onClick={(e) => { this.loadVideo(l); e.preventDefault(); }} href="#" title={l.dirname + "/" + l.filename}>
                                    <label>{l.filename}</label>
                                </a>
                            ))}
                        </p>
                    </div>
                ))}
            </div>
        );
    }
}
