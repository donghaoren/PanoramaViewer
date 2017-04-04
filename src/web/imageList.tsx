import * as React from "react";
import * as ReactDOM from "react-dom";

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
            for(let l of list) {
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
            { this.state.list.map((l, index) => (
                <a id="item" key={`img-${index}`} onClick={() => this.loadImage(l)} href="#" title={l.dirname + "/" + l.filename}>
                    <div className="image" style={{ backgroundImage: `url("${l.thumbnail}")` }}></div>
                    <label>{l.filename}</label>
                </a>
            )) }
            </div>
        );
    }
}