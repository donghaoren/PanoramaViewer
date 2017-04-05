import * as React from "react";
import * as ReactDOM from "react-dom";
import { orderFiles } from "./utils";

export interface IImageInfo {
    filename: string;
    dirname: string;
    stereoMode: string;
    thumbnail?: string;
}

export class ImageListView extends React.Component<{}, {
    list: IImageInfo[];
}> {
    constructor(props: {}) {
        super(props);

        this.state = { list: [] };

        server.rpc("getImages").then((list: IImageInfo[]) => {
            for (let l of list) {
                server.rpc("getThumbnail", l.dirname + "/" + l.filename).then((dataurl) => {
                    l.thumbnail = dataurl;
                    this.setState({ list: this.state.list });
                });
            }
            this.setState({ list: list });
        });
    }

    public loadImage(img: IImageInfo) {
        server.message("loadImage", img.dirname + "/" + img.filename, img.stereoMode);
    }

    public render() {
        return (
            <div className="image-list-view">
                {orderFiles(this.state.list).map(list => (
                    <div className="files">
                        <h3>{list.dirname}</h3>
                        <p>
                            {list.files.map((l, index) => (
                                <a id="item" key={`img-${index}`} onClick={(e) => { this.loadImage(l); e.preventDefault(); }} href="#" title={l.dirname + "/" + l.filename}>
                                    <div className="image" style={{ backgroundImage: l.thumbnail ? `url("${l.thumbnail}")` : null }}></div>
                                    <label>{l.filename}</label>
                                </a>
                            ))}
                        </p>
                    </div>
                ) }
            </div>
        );
    }
}
