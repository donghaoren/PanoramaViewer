import * as React from "react";
import * as ReactDOM from "react-dom";

export class ImageUploadView extends React.Component<{}, {}> {
    refs: {
        [ name: string ]: Element;
        file: HTMLInputElement;
    }

    constructor(props: {}) {
        super(props);

        this.state = { list: [] };
    }

    public render() {
        return (
            <div className="image-upload-view">
                Upload a custom file: <input type="file" ref="file" onChange={() => {
                    let files = this.refs.file.files;
                    if(files.length == 1) {
                        console.log(files[0]);
                        let reader = new FileReader();
                        reader.onload = (e) => {
                            let dataurl = reader.result;
                            server.message("loadImage", dataurl, "mono");
                        };
                        reader.readAsDataURL(files[0]);
                    }
                }} />
            </div>
        );
    }
}
