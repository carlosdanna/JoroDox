// @flow
import React, { Component } from 'react';
const jetpack = require('electron').remote.require('fs-jetpack');
const path = require('electron').remote.require('path');
import PdxData from '../utils/PdxData';
import PdxDataView from "./PdxDataView";
import * as THREE from 'three';
import PdxMesh from '../utils/PdxMesh';
import {Button, Checkbox, FormControlLabel, FormGroup, Icon, IconButton} from "material-ui";
import DeleteIcon from 'material-ui-icons/Delete';
import ColladaData from "../utils/ColladaData";
import ThreeJsViewer from "./ThreeJsViewer";
import {withRouter} from "react-router";

export default withRouter(class ColladaView extends Component {

    constructor(props) {
        super(props);

        this.state = {
            objectScene: null,
        };

        (new ColladaData()).convertToThreeJsScene(jetpack.read(this.props.file.path), path.resolve(this.props.file.path, '..')).then((objectScene) => {
            this.setState({objectScene: objectScene});
        });
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.file.path !== this.props.file.path) {
            (new ColladaData()).convertToThreeJsScene(jetpack.read(nextProps.file.path), path.resolve(nextProps.file.path, '..')).then((objectScene) => {
                this.setState({objectScene: objectScene});
            });
        }
    }

    convertToPdxMesh() {
        return () => {
            let pdxMesh = new PdxMesh();
            let pdxData = pdxMesh.createFromThreeJsObject(this.state.objectScene.object);
            let data = (new PdxData).writeToBuffer(pdxData);
            let newFile = this.props.file.path.replace(/.dae/, '-copy.mesh');
            jetpack.writeAsync(newFile, new Buffer(data)).then(() => {
                this.props.history.push('/fileview/'+ newFile);
            });
        };
    }

    render() {
        return (
            <div>
                <div>
                    <Button raised onClick={this.convertToPdxMesh()}>Convert to .mesh</Button>
                </div>

                <ThreeJsViewer ref={(ref) => this.threeJsViewer = ref} objectScene={this.state.objectScene}/>
            </div>
        );
    }
});
