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
            <ul>
            { this.state.list.map((l, index) => (
                <li key={`img-${index}`}>
                    <img src={l.thumbnail} />
                    <button onClick={() => this.loadImage(l)}>{l.filename}</button>
                </li>
            )) }
            </ul>
        );
    }
}