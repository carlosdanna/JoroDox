import * as THREE from 'three';
import { DDSLoader } from 'three-addons';
import ThreeJS from "./ThreeJS";
const jetpack = require('electron').remote.require('fs-jetpack');

export default class PdxMesh {
    static convertToThreeJsScene(pdxData, path) {
        let triangleCount = 0;
        let boneCount = 0;
        let skeletons = [];
        let wireframes = [];
        let colliders = [];
        let meshes = [];
        let labels = [];

        let maxExtent = 0;
        let maxExtentHeight = 0;

        path += (path === '' ? '' : '/');

        let scene = new THREE.Scene();

        // Iterate over 'shapes'
        for(let i = 0; i < pdxData.props['object'].children.length; i++)
        {
            if (pdxData.props['object'].children[i].type !== 'object')
                continue;

            let pdxShape = pdxData.props['object'].children[i];

            let bones = [];
            let bonesByName = {};
            if ('skeleton' in pdxShape.props)
            {
                let skeleton = pdxShape.props['skeleton'];

                let geometry = new THREE.Geometry();
                let material = new THREE.MeshBasicMaterial();
                material.wireframe = true;
                material.color = new THREE.Color(0x00FF00);

                // Iterate over 'bones', load all
                for(let j = 0; j < skeleton.children.length; j++)
                {
                    let bone = new THREE.Bone();
                    bone.name = skeleton.children[j].name;
                    bone.boneNr = j;

                    bonesByName[bone.name] = bone;
                    bones.push(bone);

                    let pdxBone = skeleton.children[j].props;
                    let boneTx = pdxBone.tx;

                    let parent = scene;
                    if ('pa' in pdxBone)
                        parent = bones[pdxBone.pa];

                    // NOTE: input is in ROW-major order
                    let matrix = new THREE.Matrix4().set(
                        boneTx[0], boneTx[3], boneTx[6], boneTx[9],
                        boneTx[1], boneTx[4], boneTx[7], boneTx[10],
                        boneTx[2], boneTx[5], boneTx[8], boneTx[11],
                        0, 0, 0, 1
                    );

                    if (boneTx.every(function (tx) { return tx === 0; }))
                    {
                        console.log('Bone `'+ bone.name +'` is outside skeleton.');
                        matrix = new THREE.Matrix4();
                    }
                    else
                    {
                        matrix = new THREE.Matrix4().getInverse(matrix, true);
                        bone.applyMatrix(matrix);
                    }

                    if (parent !== scene)
                    {
                        parent.updateMatrix();

                        let matrixWorldInverse = new THREE.Matrix4();
                        matrixWorldInverse.getInverse(parent.matrixWorld, true);
                        bone.applyMatrix(matrixWorldInverse);
                    }

                    parent.add(bone);

                    bone.updateMatrixWorld(true);
                    bone.updateMatrix();

                    if (pdxBone.ix !== bones.length - 1)
                        console.log('Bone #'+ pdxBone.ix.data +' is not entry #'+ (bones.length-1));
                }


                let skeletonHelper = new THREE.SkeletonHelper(bones[0]);
                for (let k = 0; k < skeletonHelper.geometry.attributes.color.count; k += 2)
                {
                    skeletonHelper.geometry.attributes.color[k] = new THREE.Color( 1, 0, 0 );
                    skeletonHelper.geometry.attributes.color[k+1] = new THREE.Color( 1, 1, 1 );
                }
                scene.add(skeletonHelper);
                skeletons.push(skeletonHelper);

                scene.bones = bones;
                scene.bonesByName = bonesByName;
            }
            boneCount += bones.length;

            // Iterate over 'objects in shapes'
            for(let j = 0; j < pdxShape.children.length; j++)
            {
                if (pdxShape.children[j].type !== 'object')
                    continue;

                let pdxMesh = pdxShape.children[j].props;

                if ('aabb' in pdxMesh)
                {
                    maxExtent = Math.max(maxExtent, -pdxMesh.aabb.props.min[0], -pdxMesh.aabb.props.min[1], -pdxMesh.aabb.props.min[2]);
                    maxExtent = Math.max(maxExtent, pdxMesh.aabb.props.max[0], pdxMesh.aabb.props.max[1], pdxMesh.aabb.props.max[2]);
                    maxExtentHeight = Math.max(maxExtentHeight, pdxMesh.aabb.props.max[1]);
                }

                if ('p' in pdxMesh)
                {
                    let geometry = new THREE.Geometry();

                    // Vertices
                    for (let k = 0; k < pdxMesh.p.length; k += 3)
                        geometry.vertices.push(new THREE.Vector3(pdxMesh.p[k], pdxMesh.p[k+1], pdxMesh.p[k+2]));
                    // Normals
                    let normals = [];
                    if ('n' in pdxMesh)
                        for (let k = 0; k < pdxMesh.n.length; k += 3)
                            normals.push(new THREE.Vector3(pdxMesh.n[k], pdxMesh.n[k+1], pdxMesh.n[k+2]));
                    // Tangents
                    let tangents = [];
                    if ('ta' in pdxMesh)
                        for (let k = 0; k < pdxMesh.ta.length; k += 4)
                            tangents.push(new THREE.Vector4(pdxMesh.ta[k], pdxMesh.ta[k+1], pdxMesh.ta[k+2], pdxMesh.ta[k+3]));
                    // Texture mapping
                    let textureMapping = [];
                    if ('u0' in pdxMesh)
                    {
                        for (let k = 0; k < pdxMesh.u0.length; k += 2)
                        {
                            textureMapping.push(new THREE.Vector2(pdxMesh.u0[k], pdxMesh.u0[k+1]));
                        }
                    }
                    // Skin
                    if ('skin' in pdxMesh)
                    {
                        let skin = pdxMesh.skin.props;
                        let influencesPerVertex = skin.bones;
                        // Stored per 4, but if less is used, this is stored for optimalization?
                        for (let k = 0; k < skin.ix.length; k += 4)
                        {
                            let a =                               skin.ix[k];
                            let b = ( influencesPerVertex > 1 ) ? skin.ix[k + 1] : -1;
                            let c = ( influencesPerVertex > 2 ) ? skin.ix[k + 2] : -1;
                            let d = ( influencesPerVertex > 3 ) ? skin.ix[k + 3] : -1;

                            geometry.skinIndices.push(new THREE.Vector4(a, b, c, d));
                        }
                        for (let k = 0; k < skin.w.length; k += 4)
                        {
                            let a =                               skin.w[k];
                            let b = ( influencesPerVertex > 1 ) ? skin.w[k + 1] : 0;
                            let c = ( influencesPerVertex > 2 ) ? skin.w[k + 2] : 0;
                            let d = ( influencesPerVertex > 3 ) ? skin.w[k + 3] : 0;

                            geometry.skinWeights.push(new THREE.Vector4(a, b, c, d));
                        }
                    }

                    // Faces
                    for (let k = 0; k < pdxMesh.tri.length; k += 3)
                    {
                        let f = new THREE.Face3(pdxMesh.tri[k], pdxMesh.tri[k+1], pdxMesh.tri[k+2]);
                        if (normals.length > 0)
                        {
                            f.vertexNormals = [
                                normals[pdxMesh.tri[k]],
                                normals[pdxMesh.tri[k+1]],
                                normals[pdxMesh.tri[k+2]]
                            ];
                        }
                        if (tangents.length > 0)
                        {
                            f.vertexTangents = [
                                tangents[pdxMesh.tri[k]],
                                tangents[pdxMesh.tri[k+1]],
                                tangents[pdxMesh.tri[k+2]]
                            ];
                        }
                        if (textureMapping.length > 0)
                        {
                            geometry.faceVertexUvs[0].push([
                                textureMapping[pdxMesh.tri[k]],
                                textureMapping[pdxMesh.tri[k+1]],
                                textureMapping[pdxMesh.tri[k+2]]
                            ]);
                        }
                        geometry.faces.push(f);
                    }
                    triangleCount += geometry.faces.length + 1;

                    // Material
                    let material = new THREE.MeshDepthMaterial();

                    let mesh = new THREE.SkinnedMesh(geometry, material);
                    mesh.name = pdxShape.children[j].name;
                    mesh.pdxData = pdxShape.children[j];
                    mesh.pdxPath = path;

                    PdxMesh.updatePdxMesh(mesh);

                    scene.add(mesh);

                    let wireframeHelper = new THREE.WireframeHelper(mesh, 0xff0000);
                    mesh.add(wireframeHelper);
                    wireframes.push(wireframeHelper);
                    /*
                    let wireframeGeometry = new THREE.WireframeGeometry(mesh);
                    let wireframe = new THREE.LineSegments( wireframeGeometry );
                    wireframe.material.depthTest = false;
                    wireframe.material.opacity = 1;
                    wireframe.material.transparent = true;
                    wireframe.material.color = new THREE.Color( 0xff0000 );
                    mesh.add(wireframe);
                    wireframes.push(wireframe);
                    */

                    if (scene.bones && scene.bones.length)
                    {
                        mesh.add(scene.bones[0]);
                        mesh.bind(new THREE.Skeleton(scene.bones));
                    }

                    mesh.pose();

                    if ('material' in pdxMesh && pdxMesh.material.props.shader === 'Collision')
                        colliders.push(mesh);

                    meshes.push(mesh);
                }
            }
        }

        return {
            'object': scene,
            'distance': maxExtent,
            'maxExtentHeight': maxExtentHeight,
            'labels': labels,
            'triangleCount': triangleCount,
            'boneCount': boneCount,
            'meshCount': meshes.length,
            'meshes': meshes,
            'animations': [],
            'colliders': colliders,
            'skeletons': skeletons,
            'wireframes': wireframes,
        };
    }

    static updatePdxMesh(mesh)
    {
        if (!mesh.pdxData)
            return;

        let pdxMaterial = mesh.pdxData.props.material.props;

        if (pdxMaterial.shader === 'Collision')
        {
            let material = new THREE.MeshBasicMaterial();
            material.wireframe = true;
            material.color = new THREE.Color(0, 1, 0);

            mesh.material = material;
        }
        else
        {
            if (!(pdxMaterial.shader === 'PdxMeshTextureAtlas'
                    || pdxMaterial.shader === 'PdxMeshAlphaBlendNoZWrite'
                    || pdxMaterial.shader === 'PdxMeshColor'
                    || pdxMaterial.shader === 'PdxMeshStandard'
                    || pdxMaterial.shader === 'PdxMeshSnow'
                    || pdxMaterial.shader === 'PdxMeshAlphaBlend'
                    || pdxMaterial.shader === 'PdxMeshStandard_NoFoW_NoTI'
                    || pdxMaterial.shader === 'JdxMeshShield'
                    || pdxMaterial.shader === 'JdxMeshShieldTextureAtlas'))
            {
                console.log('Unknown shader: '+ pdxMaterial.shader);
            }

            let material = new THREE.MeshPhongMaterial();
            if ('diff' in pdxMaterial && pdxMaterial.diff !== 'nodiff.dds')
            {
                material.map = ThreeJS.loadDdsToTexture(mesh.pdxPath + pdxMaterial.diff);
                material.map.fileName = pdxMaterial.diff;
            }
            if ('n' in pdxMaterial && pdxMaterial.n !== 'nonormal.dds')
            {
                material.normalMap = ThreeJS.loadDdsToTexture(mesh.pdxPath + pdxMaterial.n);
                material.normalMap.fileName = pdxMaterial.n;
            }
            if ('spec' in pdxMaterial && pdxMaterial.spec !== 'nospec.dds')
            {
                material.specularMap = ThreeJS.loadDdsToTexture(mesh.pdxPath + pdxMaterial.spec);
                material.specularMap.fileName = pdxMaterial.spec;
            }

            if (pdxMaterial.shader === 'PdxMeshAlphaBlendNoZWrite')
            {
                material.transparent = true;
            }
            if (pdxMaterial.shader === 'PdxMeshAlphaBlend')
            {
                material.transparent = true;
            }

            if (mesh.geometry.skinIndices.length)
                material.skinning = true;
            mesh.material = material;
        }

    }

    setPdxAnimation(viewScene, pdxAnimationData)
    {
        let deferred = $q.defer();

        let scene = viewScene.viewConfig.viewObject.object;

        if (!scene.bones || !scene.bones.length)
        {
            deferred.reject('Object does not contain bones.');
            return deferred.promise;
        }

        let animationData = null;

        if (pdxAnimationData)
        {
            let pdxAnimProps = pdxAnimationData.props.info.props;

            animationData = {
                'name': 'test',
                'fps': pdxAnimProps.fps,
                'length': pdxAnimProps.sa / pdxAnimProps.fps,
                'hierarchy': [],
                // PDX Extra:
                sampleCount: pdxAnimProps.sa,
            };

            let tBones = [];
            let qBones = [];
            let sBones = [];

            let alternativeNames = {
                'attack_L_hand': 'Left_hand_node',
                'attack_R_hand': 'Right_hand_node',
            };

            for (let k = 0; k < pdxAnimationData.props.info.children.length; k++)
            {
                let pdxAnimBone = pdxAnimationData.props.info.children[k];

                if (pdxAnimBone.type !== 'object')
                    continue;

                let bone = null;
                // Assign 'base' animation state
                if (scene.bonesByName[pdxAnimBone.name])
                    bone = scene.bonesByName[pdxAnimBone.name];
                if (!bone && alternativeNames[pdxAnimBone.name] && scene.bonesByName[alternativeNames[pdxAnimBone.name]])
                    bone = scene.bonesByName[alternativeNames[pdxAnimBone.name]];

                if (bone)
                {
                    animationData.hierarchy.push({
                        parent: bone.parent instanceof THREE.Bone ? bone.parent.boneNr : -1,
                        name: pdxAnimBone.name,
                        keys:[{time: 0, pos: pdxAnimBone.props.t, rot: pdxAnimBone.props.q, scl: [pdxAnimBone.props.s, pdxAnimBone.props.s, pdxAnimBone.props.s]}],
                        // PDX Extra:
                        sampleT: pdxAnimBone.props.sa.indexOf('t') !== -1,
                        sampleQ: pdxAnimBone.props.sa.indexOf('q') !== -1,
                        sampleS: pdxAnimBone.props.sa.indexOf('s') !== -1,
                        skipData: false,
                    });
                }
                else
                {
                    console.log('Animation bone '+ pdxAnimBone.name +' not found in model.');

                    animationData.hierarchy.push({
                        parent: -1,
                        name: pdxAnimBone.name,
                        keys:[{time: 0, pos: pdxAnimBone.props.t, rot: pdxAnimBone.props.q, scl: [pdxAnimBone.props.s, pdxAnimBone.props.s, pdxAnimBone.props.s]}],
                        // PDX Extra:
                        sampleT: pdxAnimBone.props.sa.indexOf('t') !== -1,
                        sampleQ: pdxAnimBone.props.sa.indexOf('q') !== -1,
                        sampleS: pdxAnimBone.props.sa.indexOf('s') !== -1,
                        skipData: true,
                    });
                }
            }


            let offsetT = 0;
            let offsetQ = 0;
            let offsetS = 0;
            let pdxAnimSamples = pdxAnimationData.props.samples.props;
            for (let sample = 0; sample < animationData.sampleCount; sample++ )
            {
                for(let k = 0; k < animationData.hierarchy.length; k++)
                {
                    let hier = animationData.hierarchy[k];
                    if (hier.sampleT || hier.sampleQ || hier.sampleS)
                    {
                        let key = {};

                        key.time = sample * (1/animationData.fps);

                        if (hier.sampleT)
                        {
                            key.pos = [pdxAnimSamples.t[offsetT], pdxAnimSamples.t[offsetT + 1], pdxAnimSamples.t[offsetT + 2]];
                            offsetT += 3;
                        }

                        if (hier.sampleQ)
                        {
                            key.rot = [pdxAnimSamples.q[offsetQ], pdxAnimSamples.q[offsetQ + 1], pdxAnimSamples.q[offsetQ + 2], pdxAnimSamples.q[offsetQ + 3]];
                            offsetQ += 4;
                        }

                        if (hier.sampleS)
                        {
                            key.scl = [pdxAnimSamples.s[offsetS], pdxAnimSamples.s[offsetS], pdxAnimSamples.s[offsetS]];
                            offsetS += 1;
                        }

                        hier.keys.push(key);
                    }
                }
            }
        }

        // Stop any existing animations
        for (let i = 0; i < viewScene.viewConfig.viewObject.animations.length; i++)
        {
            viewScene.viewConfig.viewObject.animations[i].stop();
        }
        viewScene.viewConfig.viewObject.animations = [];

        // 'Reset' skeleton and start new animation (if set)
        scene.traverse(function (subObject) {
            if (subObject instanceof THREE.SkinnedMesh)
                subObject.pose();
        });
        if (animationData)
        {
            let animation = new THREE.Animation(viewScene.viewConfig.viewObject.object.bones[0], animationData);
            animation.play();
            viewScene.viewConfig.viewObject.animations.push(animation);
        }
    }

    createFromThreeJsObject(object, options) {
        if (!options)
            options = {
                textureBaseName: 'unknown',
                pdxShader: 'PdxMeshStandard',
            };

        let pdxDataRoot = {name: 'pdxData', type: 'object', children: []};
        pdxDataRoot.children.push({name: 'pdxasset', type: 'int', data: [1, 0]});

        let objectsRoot = {name: 'object', type: 'object', children: []};
        pdxDataRoot.children.push(objectsRoot);
        pdxDataRoot.children.push({name: 'locator', type: 'object', children: []});

        let shapeRoot = {name: 'jorodoxShape', type: 'object', children: []};
        objectsRoot.children.push(shapeRoot);

        // 'internal' function
        let getVertexNrForUniqueData = function (vertNr, uv, normal, vertexToUniqueData, verts, skinIds, skinWeights)
        {
            if (!vertexToUniqueData[vertNr])
            {
                vertexToUniqueData[vertNr] = [{'uv': uv, 'normal': normal, v: vertNr}];
                return vertNr;
            }

            // See if we already mapped this UV before
            let foundVertNr = false;
            for (let j = 0, jl = vertexToUniqueData[vertNr].length; j < jl; j++)
            {
                foundVertNr = vertexToUniqueData[vertNr][j].v;

                if (!vertexToUniqueData[vertNr][j].normal.equals(normal))
                {
                    foundVertNr = false;
                }
                else
                {
                    for (let i = 0; i < vertexToUniqueData[vertNr][j].uv.length; i++)
                    {
                        if (!uv[i] || !vertexToUniqueData[vertNr][j].uv[i].equals(uv[i]))
                        {
                            foundVertNr = false;
                            break;
                        }
                    }
                }

                if (foundVertNr !== false)
                    return foundVertNr;
            }

            // Create new vert, copy of existing
            verts.push(verts[vertNr*3]);
            verts.push(verts[vertNr*3+1]);
            verts.push(verts[vertNr*3+2]);

            // Don't forget skin
            skinIds.push(skinIds[vertNr*4]);
            skinIds.push(skinIds[vertNr*4+1]);
            skinIds.push(skinIds[vertNr*4+2]);
            skinIds.push(skinIds[vertNr*4+2]);
            skinWeights.push(skinWeights[vertNr*4]);
            skinWeights.push(skinWeights[vertNr*4+1]);
            skinWeights.push(skinWeights[vertNr*4+2]);
            skinWeights.push(skinWeights[vertNr*4+2]);

            let newVert = ((verts.length / 3) - 1) | 0; // '| 0' = cast to int

            vertexToUniqueData[vertNr].push({'uv': uv, 'normal': normal, v: newVert});

            return newVert;
        };

        // Get bones
        let boneList = this.getBoneListRooted(object);
        let boneData = [];
        let boneNrToHeirarchyBoneNr = [];
        boneNrToHeirarchyBoneNr[-1] = -1;
        if (boneList.length > 0)
        {
            let multipleRootBones = (boneList[0].name === 'AddedRoot');

            for (let i = 0; i < boneList.length; i++)
            {
                // pdxmesh uses a 3x4 transform matrix for bones in the world space, whereas Three.js uses a 4x4 matrix (local&world space)
                // we have to transform it and snip off the 'skew' row

                boneList[i].updateMatrix();
                boneList[i].updateMatrixWorld(true);
                boneList[i].parent.updateMatrix();
                boneList[i].parent.updateMatrixWorld(true);

                // Get matrix of bone in world matrix
                let pdxMatrix = new THREE.Matrix4().multiplyMatrices(boneList[i].parent.matrixWorld, boneList[i].matrix);
                pdxMatrix = new THREE.Matrix4().getInverse(pdxMatrix, true);
                let m = pdxMatrix.elements;

                let parentBoneNr = boneList[i].parent.boneNr;

                // Set to added root bone
                if (!(boneList[i].parent instanceof THREE.Bone) && multipleRootBones && i !== 0)
                    parentBoneNr = 0;

                // NOTE: m is in COLUMN-major order
                boneData.push({
                    name: boneList[i].name,
                    type: 'object',
                    children: [
                        {name: 'ix', type: 'int', data: [i]},
                        {name: 'pa', type: 'int', data: [boneList[i].parent.boneNr]},
                        {name: 'tx', type: 'float', data: [
                                m[0], m[1], m[2],
                                m[4], m[5], m[6],
                                m[8], m[9], m[10],
                                m[12], m[13], m[14],
                            ]},
                    ]
                });

                if (parentBoneNr === undefined)
                {
                    // Remove 'pa' at root node
                    boneData[i].children = [boneData[i].children[0], boneData[i].children[2]];
                }
            }
        }

        // find all geometry
        object.traverse(function (subObject) {
            if (subObject instanceof THREE.Mesh)
            {
                if (subObject.geometry.bones)
                {
                    for (let i = 0; i < subObject.geometry.bones.length; i++)
                    {
                        for (let k = 0; k < boneList.length; k++)
                        {
                            if (subObject.geometry.bones[i].name === boneList[k].name)
                            {
                                boneNrToHeirarchyBoneNr[i] = k;
                                break;
                            }
                        }
                    }
                }

                // Bounding box
                let bb = new THREE.Box3();
                bb.setFromObject(subObject);

                // Scale / rotate to world
                subObject.geometry.applyMatrix(subObject.matrixWorld);

                // Vertices
                let verts = [];
                for (let k = 0, l = subObject.geometry.vertices.length; k < l; k++)
                {
                    verts.push.apply(verts, subObject.geometry.vertices[k].toArray());
                }

                // Face-stored data
                let tri = [];
                let normals = [];
                let tangents = [];
                let uvs = [];

                if (!subObject.geometry.hasTangents && subObject.geometry.faceVertexUvs[0].length)
                    subObject.geometry.computeTangents();

                // Assume skinIds as long as skinWeights
                let skinIds = [];
                let skinWeights = [];
                let bonesUsed = 0;
                for (let k = 0, l = subObject.geometry.skinIndices.length; k < l; k++)
                {
                    skinIds.push(
                        subObject.geometry.skinWeights[k].x ? boneNrToHeirarchyBoneNr[subObject.geometry.skinIndices[k].x] : -1,
                        subObject.geometry.skinWeights[k].y ? boneNrToHeirarchyBoneNr[subObject.geometry.skinIndices[k].y] : -1,
                        subObject.geometry.skinWeights[k].z ? boneNrToHeirarchyBoneNr[subObject.geometry.skinIndices[k].z] : -1,
                        subObject.geometry.skinWeights[k].w ? boneNrToHeirarchyBoneNr[subObject.geometry.skinIndices[k].w] : -1
                    );
                    skinWeights.push(
                        subObject.geometry.skinWeights[k].x,
                        subObject.geometry.skinWeights[k].y,
                        subObject.geometry.skinWeights[k].z,
                        subObject.geometry.skinWeights[k].w
                    );

                    let used = Math.ceil(subObject.geometry.skinWeights[k].x) + Math.ceil(subObject.geometry.skinWeights[k].y) + Math.ceil(subObject.geometry.skinWeights[k].z) + Math.ceil(subObject.geometry.skinWeights[k].w);

                    bonesUsed = Math.max(used, bonesUsed);
                }

                // See if we have any multi-UV vertices, split those
                let vertexToUniqueData = [];
                let uvCount = subObject.geometry.faceVertexUvs.length;
                for (let k = 0, l = subObject.geometry.faces.length; k < l; k++)
                {
                    let face = subObject.geometry.faces[k];
                    let faceUvs = [];
                    for (let j = 0; j < 3; j++)
                    {
                        faceUvs[j] = [];
                        for (let i = 0; i < uvCount; i++)
                            if (subObject.geometry.faceVertexUvs[i][k])
                                faceUvs[j][i] = subObject.geometry.faceVertexUvs[i][k][j];
                    }

                    face.a = getVertexNrForUniqueData(face.a, faceUvs[0], face.vertexNormals[0], vertexToUniqueData, verts, skinIds, skinWeights);
                    face.b = getVertexNrForUniqueData(face.b, faceUvs[1], face.vertexNormals[1], vertexToUniqueData, verts, skinIds, skinWeights);
                    face.c = getVertexNrForUniqueData(face.c, faceUvs[2], face.vertexNormals[2], vertexToUniqueData, verts, skinIds, skinWeights);
                }


                // Process all faces
                for (let k = 0, l = subObject.geometry.faces.length; k < l; k++)
                {
                    let face = subObject.geometry.faces[k];
                    tri.push(face.a, face.b, face.c);

                    this.insertValues(normals, face.a*3, face.vertexNormals[0].toArray());
                    this.insertValues(normals, face.b*3, face.vertexNormals[1].toArray());
                    this.insertValues(normals, face.c*3, face.vertexNormals[2].toArray());

                    if (face.vertexTangents.length)
                    {
                        this.insertValues(tangents, face.a*4, face.vertexTangents[0].toArray());
                        this.insertValues(tangents, face.b*4, face.vertexTangents[1].toArray());
                        this.insertValues(tangents, face.c*4, face.vertexTangents[2].toArray());
                    }
                    else
                    {
                        this.insertValues(tangents, face.a*4, new THREE.Vector4().toArray());
                        this.insertValues(tangents, face.b*4, new THREE.Vector4().toArray());
                        this.insertValues(tangents, face.c*4, new THREE.Vector4().toArray());
                    }


                    for (let i = 0; i < uvCount; i++)
                    {
                        if (!uvs[i])
                            uvs[i] = [];
                        if (subObject.geometry.faceVertexUvs[i])
                        {
                            let uv = subObject.geometry.faceVertexUvs[i][k];

                            if (uv)
                            {
                                let flipY = !subObject.material.map || subObject.material.map.flipY;

                                uvs[i][face.a*2] = uv[0].x;
                                uvs[i][face.a*2+1] = flipY? 1 - uv[0].y : uv[0].y;
                                uvs[i][face.b*2] = uv[1].x;
                                uvs[i][face.b*2+1] = flipY? 1 - uv[1].y : uv[1].y;
                                uvs[i][face.c*2] = uv[2].x;
                                uvs[i][face.c*2+1] = flipY? 1 - uv[2].y : uv[2].y;
                            }
                            else
                            {
                                uvs[i][face.a*2] = 0;
                                uvs[i][face.a*2+1] = 0;
                                uvs[i][face.b*2] = 0;
                                uvs[i][face.b*2+1] = 0;
                                uvs[i][face.c*2] = 0;
                                uvs[i][face.c*2+1] = 0;
                            }
                        }
                    }
                }

                let mesh = {name: 'mesh', type: 'object', children: []};
                mesh.children.push({name: 'p', type: 'float', data: verts});
                mesh.children.push({name: 'n', type: 'float', data: normals});
                mesh.children.push({name: 'ta', type: 'float', data: tangents});
                for (let i = 0; i < uvCount; i++)
                    mesh.children.push({name: 'u' + i, type: 'float', data: uvs[i]});
                mesh.children.push({name: 'tri', type: 'int', data: tri});
                mesh.children.push({name: 'aabb', type: 'object', children: [
                        {name: 'min', type: 'float', data: [bb.min.x, bb.min.y, bb.min.z]},
                        {name: 'max', type: 'float', data: [bb.max.x, bb.max.y, bb.max.z]},
                    ]});
                mesh.children.push({name: 'material', type: 'object', children: [
                        {name: 'shader', type: 'string', data: options.pdxShader ? options.pdxShader : 'PdxMeshStandard', nullByteString: true},
                        {name: 'diff', type: 'string', data: options.textureBaseName +'_diffuse.dds', nullByteString: true},
                        {name: 'n', type: 'string', data: options.textureBaseName +'_normal.dds', nullByteString: true},
                        {name: 'spec', type: 'string', data: options.textureBaseName +'_spec.dds', nullByteString: true},
                    ]});
                shapeRoot.children.push(mesh);

                if (boneData.length)
                {
                    mesh.children.push({name: 'skin', type: 'object', children: [
                        {name: 'bones', type: 'int', data: [bonesUsed]},
                        {name: 'ix', type: 'int', data: skinIds},
                        {name: 'w', type: 'float', data: skinWeights},
                    ]});
                }
            }
        }.bind(this));

        if (boneData.length)
            shapeRoot.children.push({name: 'skeleton', type: 'object', children: boneData});

        return pdxDataRoot;
    }

    getBoneListRooted(object) {

        let boneList = this.getBoneList(object);

        if (boneList.length > 0)
        {
            let multipleRootBones = false;
            let filteredBoneList = [];
            let boneByName = {};
            for (let i = 0; i < boneList.length; i++)
            {
                // Skip double bones by name
                if (boneByName[boneList[i].name])
                    continue;

                boneByName[boneList[i].name] = boneList[i];

                filteredBoneList.push(boneList[i]);
                boneList[i].boneNr = filteredBoneList.length - 1;

                if (!(boneList[i].parent instanceof THREE.Bone) && i !== 0)
                {
                    multipleRootBones = true;
                }
            }

            // Multiple roots - add a new single root
            if (multipleRootBones)
            {
                let newRoot = new THREE.Bone();
                newRoot.name = 'AddedRoot';
                object.add(newRoot);
                filteredBoneList.unshift(newRoot);
            }
            return filteredBoneList;
        }

        return boneList;
    }

    getBoneList(object, parentNr) {

        let boneList = [];

        if (object instanceof THREE.Bone)
        {
            boneList.push(object);
            object.boneParentNr = parentNr;
        }

        for (let i = 0; i < object.children.length; i++)
        {
            boneList.push.apply(boneList, this.getBoneList(object.children[i]));
        }

        return boneList;
    }
}