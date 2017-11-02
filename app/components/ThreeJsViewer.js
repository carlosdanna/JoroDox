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

export default class ThreeJsViewer extends Component {

    constructor(props) {
        super(props);

        this.viewConfig = {
            distance: 20,
            update: null,
            showSkeletons: true,
            showWireframes: false,
            showColliders: true,
            showMeshes: true,
            showSpotlights: true,
            rotate: true,
            rotation: 0,
        };
    }

    componentDidMount () {
        this.createScene();
    }

    componentDidUpdate() {
        this.createScene();
    }

    createScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(45, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 1000);
        this.camera.position.set(10,10,0);
        this.camera.up = new THREE.Vector3(0,1,0);
        this.camera.lookAt(new THREE.Vector3(0,0,0));

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
        });
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);

        // Grid
        let size = 100, step = 1;
        let geometry = new THREE.Geometry();
        let material = new THREE.LineBasicMaterial({color: 0x303030});
        for (let i = - size; i <= size; i += step)
        {
            geometry.vertices.push(new THREE.Vector3( - size, - 0.04, i ));
            geometry.vertices.push(new THREE.Vector3(   size, - 0.04, i ));
            geometry.vertices.push(new THREE.Vector3( i, - 0.04, - size ));
            geometry.vertices.push(new THREE.Vector3( i, - 0.04,   size ));
        }
        let line = new THREE.Line(geometry, material, THREE.LineSegments);
        this.scene.add(line);

        // Some particle lights
        this.particleLight = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 8), new THREE.MeshBasicMaterial({color: 0xffffff }));
        this.scene.add(this.particleLight);
        let pointLight = new THREE.PointLight( 0xffffff, 4 );
        this.particleLight.add( pointLight );

        // General lights
        this.scene.add(new THREE.AmbientLight(0xcccccc ));

        // Some directional lights
        let directionalLight = new THREE.DirectionalLight(0xeeeeee);
        directionalLight.position.x = Math.random() - 0.5;
        directionalLight.position.y = Math.random() - 0.5;
        directionalLight.position.z = Math.random() - 0.5;
        directionalLight.position.normalize();
        this.scene.add( directionalLight );

        this.objectScene = this.props.objectScene;

        if (!this.objectScene)
            return;

        this.scene.add(this.objectScene.object);
        this.viewConfig = {
            distance: this.objectScene.distance * 4,
            update: null,
            showSkeletons: true,
            showWireframes: false,
            showColliders: true,
            showMeshes: true,
            showSpotlights: true,
            rotate: true,
            rotation: 0,
        };
        this.clock = new THREE.Clock();

        this.animateScene();
    }

    animateScene()
    {
        requestAnimationFrame(this.animateScene.bind(this));

        // Rotate camera
        let delta = this.clock.getDelta();
        if (this.viewConfig.rotate) {
            this.viewConfig.rotation += delta * 0.5;
        }

        this.camera.position.x = Math.cos(this.viewConfig.rotation) * this.viewConfig.distance;
        this.camera.position.y = this.viewConfig.distance / 4;
        this.camera.position.z = Math.sin(this.viewConfig.rotation) * this.viewConfig.distance;
        this.camera.lookAt(new THREE.Vector3(0, this.objectScene ? this.objectScene.maxExtentHeight / 2 : 0, 0));


        // Rotate particle lights
        let timer = Date.now() * 0.0005;
        this.particleLight.visible = this.viewConfig.showSpotlights;
        this.particleLight.position.x = Math.sin(timer * 4) * 30009;
        this.particleLight.position.y = Math.cos(timer * 5) * 40000;
        this.particleLight.position.z = Math.cos(timer * 4) * 30009;

        if (this.objectScene) {

            if (this.objectScene.skeletons) {
                for (let i = 0; i < this.objectScene.skeletons.length; i++) {
                    this.objectScene.skeletons[i].visible = this.viewConfig.showSkeletons;
                }
            }
            if (this.objectScene.wireframes) {
                for (let i = 0; i < this.objectScene.wireframes.length; i++) {
                    this.objectScene.wireframes[i].visible = this.viewConfig.showWireframes;
                }
            }
            if (this.objectScene.meshes) {
                for (let i = 0; i < this.objectScene.meshes.length; i++) {
                    this.objectScene.meshes[i].material.visible = this.viewConfig.showMeshes;
                }
            }
            if (this.objectScene.colliders) {
                for (let i = 0; i < this.objectScene.colliders.length; i++) {
                    this.objectScene.colliders[i].material.visible = this.viewConfig.showColliders;
                }
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    toggleValue(name) {
        return (event, checked) => {
            this.viewConfig[name] = !this.viewConfig[name];
        }
    }

    clickZoomOut() {
        return () => {
            this.viewConfig.distance = this.viewConfig.distance * 1.1;
        };
    }

    clickZoomIn() {
        return () => {
            this.viewConfig.distance = this.viewConfig.distance * 0.9;
        };
    }
    render() {
        return (
            <div>
                <FormGroup row style={{alignItems: 'center'}}>
                    <FormControlLabel label="Skeletons" control={<Checkbox defaultChecked={this.viewConfig.showSkeletons} onChange={this.toggleValue('showSkeletons')} />} />
                    <FormControlLabel label="Mesh" control={<Checkbox defaultChecked={this.viewConfig.showMeshes} onChange={this.toggleValue('showMeshes')} />} />
                    <FormControlLabel label="Wireframes" control={<Checkbox defaultChecked={this.viewConfig.showWireframes} onChange={this.toggleValue('showWireframes')} />} />
                    <FormControlLabel label="Colliders" control={<Checkbox defaultChecked={this.viewConfig.showColliders} onChange={this.toggleValue('showColliders')} />} />
                    <FormControlLabel label="Spotlights" control={<Checkbox defaultChecked={this.viewConfig.showSpotlights} onChange={this.toggleValue('showSpotlights')} />} />

                    <FormControlLabel label="Rotate" control={<Checkbox defaultChecked={this.viewConfig.rotate} onChange={this.toggleValue('rotate')} />} />

                </FormGroup>

                <div style={{position: 'relative', display: 'inline-block'}}>
                    <canvas ref={canvas => this.canvas = canvas} style={{width: 900, height: 600}} />
                    <div style={{position: 'absolute', right: 10, top: 10}}>
                        <Button fab color="accent" aria-label="Zoom in" style={{marginRight: 5, width: 36, height: 36}} onClick={this.clickZoomIn()}>
                            <Icon>zoom_in</Icon>
                        </Button>
                        <Button fab color="accent" aria-label="Zoom out" style={{marginRight: 0, width: 36, height: 36}} onClick={this.clickZoomOut()}>
                            <Icon>zoom_out</Icon>
                        </Button>
                    </div>
                    <div style={{position: 'absolute', left: 10, top: 10, color: 'white', fontSize: '70%'}}>
                        Meshes: {this.props.objectScene ? this.props.objectScene.meshCount : '-'}<br />
                        Triangles: {this.props.objectScene ? this.props.objectScene.triangleCount : '-'}<br />
                        Bones: {this.props.objectScene ? this.props.objectScene.boneCount : '-'}<br />
                    </div>
                </div>
            </div>
        );
    }
}