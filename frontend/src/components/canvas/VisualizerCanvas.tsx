import React, { Component } from 'react';
import { Stage, Layer } from 'react-konva';
import Konva from 'konva';
import dagre from 'dagre';
import Node from './VisualizerNode';
import Line from './VisualizerLine';
import Menu from './VisualizerMenu';

import { NodeProps, LineProps, TreeNode, CanvasPropsAndRedux, NodeInterfaceT } from '../interfaces';

import '../../scss/VisualizerCanvas.scss';

import { CanvasProps, CanvasState } from '../interfaces';

import { connect } from 'react-redux';
import { FileState } from '../../features/file/fileSlice';
import { ProofState, selectProof } from '../../features/proof/proofSlice';
import { ThemeState } from '../../features/theme/themeSlice';
import { hideNodes, unhideNodes, foldAllDescendants, applyView } from '../../features/proof/proofSlice';

function handleWheel(e: Konva.KonvaEventObject<WheelEvent>): { stageScale: number; stageX: number; stageY: number } {
    e.evt.preventDefault();

    const scaleBy = 1.08;
    const stage = e.target.getStage();
    if (stage) {
        const oldScale = stage.scaleX();
        const pointerPosition = stage.getPointerPosition();
        let x, y;

        if (pointerPosition) {
            [x, y] = [pointerPosition.x, pointerPosition.y];
        } else {
            [x, y] = [0, 0];
        }

        const mousePointTo = {
            x: x / oldScale - stage.x() / oldScale,
            y: y / oldScale - stage.y() / oldScale,
        };

        const newScale = e.evt.deltaY > 0 ? oldScale * scaleBy : oldScale / scaleBy;

        return {
            stageScale: newScale,
            stageX: -(mousePointTo.x - x / newScale) * newScale,
            stageY: -(mousePointTo.y - y / newScale) * newScale,
        };
    }
    return {
        stageScale: 1,
        stageX: 0,
        stageY: 0,
    };
}

class Canvas extends Component<CanvasPropsAndRedux, CanvasState> {
    constructor(props: CanvasPropsAndRedux) {
        super(props);
        this.componentDidUpdate = this.componentDidUpdate.bind(this);

        const { proofNodes } = this.props;
        this.state = {
            canvasSize: {
                width: 520,
                height: 300,
            },
            stage: {
                stageScale: 1,
                stageX: 0,
                stageY: 0,
            },
            proofNodes,
            showingNodes: {},
            showingEdges: {},
            nodeOnFocus: NaN,
            nodesSelected: [],
            myProofState: [],
        };
    }

    componentDidMount(): void {
        const { showingNodes } = this.state;
        const { view, myProof } = this.props;

        this.setState({ myProofState: myProof });

        this.setState({
            showingNodes: myProof.reduce(
                (ac: any, node) => ((ac[node.id] = new Node(Canvas.newNodeProps(node))), ac),
                {},
            ),
        });

        if (showingNodes[0]) {
            if (view !== 'imported_data') {
                const [width, height] = [window.innerWidth, window.innerHeight - 50];

                this.setState({
                    showingNodes,
                    canvasSize: {
                        width,
                        height,
                    },
                    stage: {
                        stageScale: 1,
                        stageX: width / 2 - (showingNodes[0].props.x + 300 / 2),
                        stageY: height / 10 - (showingNodes[0].props.y + 30 / 2),
                    },
                });
            }
        }
    }

    static newNodeProps = (node: NodeInterfaceT): NodeProps => {
        return {
            id: node.id,
            conclusion: node.conclusion,
            rule: node.rule,
            args: node.args,
            x: 0,
            y: 0,
            nHided: node.hiddenNodes ? node.hiddenNodes.length : 0,
            nDescendants: 0, //TODO
            selected: false,
            color: '#fff',
            setNodeOnFocus: () => undefined,
            toggleNodeSelection: () => undefined,
            updateNodeState: () => undefined,
            unfoldOnClick: () => undefined,
            openDrawer: () => undefined,
        };
    };

    LineProps = (key: string, from: NodeProps, to: NodeProps): LineProps => ({
        key,
        points: [from.x + 150, from.y, to.x + 150, to.y + 105],
    });

    static getDerivedStateFromProps(props: CanvasPropsAndRedux, current_state: CanvasState) {
        if (current_state.myProofState !== props.myProof) {
            const showingNodes = props.myProof.reduce(
                (ac: any, node) => ((ac[node.id] = new Node(Canvas.newNodeProps(node))), ac),
                {},
            );
            if (showingNodes[0]) {
                const g = new dagre.graphlib.Graph();
                g.setGraph({ rankdir: 'BT', ranker: 'tight-tree' });
                g.setDefaultEdgeLabel(function () {
                    return {};
                });
                props.myProof.forEach((node) => {
                    g.setNode(node.id.toString(), { width: 300, height: 130 });
                    node.children.forEach((child) => {
                        g.setEdge(child.toString(), node.id.toString());
                    });
                });
                dagre.layout(g);
                const xOffset = g.node('0').x - (showingNodes[0].props.x ? showingNodes[0].props.x : 0);
                const yOffset = g.node('0').y - (showingNodes[0].props.y ? showingNodes[0].props.y : 0);
                g.nodes().forEach(function (v) {
                    try {
                        const { x, y } = g.node(v);
                        showingNodes[parseInt(v)] = new Node({
                            ...showingNodes[parseInt(v)].props,
                            x: x - xOffset,
                            y: y - yOffset,
                        });
                    } catch (e) {
                        console.log(e);
                    }
                });
            }

            return {
                showingNodes: showingNodes,
                showingEdges: {},
                myProofState: props.myProof,
            };
        }
        return null;
    }

    componentDidUpdate(prevProps: CanvasPropsAndRedux) {
        const { showingNodes, showingEdges } = this.state;
        const { openDrawer } = this.props;
        if (prevProps.myProof !== this.props.myProof) {
            this.props.myProof.forEach((node) => {
                if (showingNodes[node.parents[0]]) {
                    showingEdges[`${node.id}->${node.parents[0]}`] = Line(
                        this.LineProps(
                            `${node.id}->${parent[0]}`,
                            showingNodes[node.id].props,
                            showingNodes[node.parents[0]].props,
                        ),
                    );
                }
            });
            Object.keys(showingNodes).forEach((nodeId: string) => {
                showingNodes[parseInt(nodeId)] = new Node({
                    ...showingNodes[parseInt(nodeId)].props,
                    setNodeOnFocus: this.setNodeOnFocus,
                    toggleNodeSelection: this.toggleNodeSelection,
                    updateNodeState: this.updateNodeState,
                    unfoldOnClick: this.unfoldOnClick,
                    openDrawer: openDrawer,
                });
            });

            this.setState({ showingEdges: showingEdges });
        }
    }

    setNodeOnFocus = (id: number): void => {
        this.setState({ nodeOnFocus: id });
    };

    toggleNodeSelection = (id: number): void => {
        const { showingNodes } = this.state;
        let { nodesSelected } = this.state;
        if (showingNodes[id].props.selected) {
            showingNodes[id] = new Node({ ...showingNodes[id].props, selected: false });
            nodesSelected = nodesSelected.filter((nodeId) => nodeId !== id);
        } else {
            showingNodes[id] = new Node({ ...showingNodes[id].props, selected: true });
            nodesSelected.push(id);
        }
        this.setState({ showingNodes, nodesSelected });
    };

    updateNodeState = (key: number, x: number, y: number): void => {
        const { showingNodes, showingEdges } = this.state;
        showingNodes[key] = new Node({ ...showingNodes[key].props, x, y });

        Object.keys(showingEdges)
            .filter((edgeKey) => edgeKey.indexOf(key.toString()) !== -1)
            .forEach((edge) => {
                const [from, to] = edge.split('->').map((x) => parseInt(x));
                showingEdges[edge] = Line(this.LineProps(edge, showingNodes[from].props, showingNodes[to].props));
            });
        this.setState({ showingNodes, showingEdges });
    };

    unfoldOnClick = (id: number): void => {
        const { unhideNodes } = this.props;
        const { myProofState } = this.state;
        const hiddenNodess = myProofState[id].hiddenNodes ? myProofState[id].hiddenNodes : [];
        console.log(hiddenNodess);
        unhideNodes(hiddenNodess ? hiddenNodess.map((node) => node.id) : []);
    };

    foldSelectedNodes = (): void => {
        const { nodesSelected } = this.state;
        const { hideNodes } = this.props;
        hideNodes(nodesSelected);
    };

    unfold = (): void => {
        const { nodeOnFocus, myProofState } = this.state;
        const { unhideNodes } = this.props;

        const obj = myProofState.find((o) => o.id === nodeOnFocus);

        const hiddenNodess = obj ? (obj.hiddenNodes ? obj.hiddenNodes : []) : [];
        unhideNodes(hiddenNodess ? hiddenNodess.map((node) => node.id) : []);
        this.setState({ nodesSelected: [] });
    };

    newTree = (piId: number): TreeNode[] => {
        const { proofNodes } = this.state;

        return this.hiddenNodesTree(
            proofNodes[piId].hidedNodes
                .sort((a, b) => a - b)
                .map((nodeId) => {
                    return {
                        id: nodeId,
                        icon: 'graph',
                        parentId: proofNodes[nodeId].parent,
                        label: proofNodes[nodeId].rule + ' => ' + proofNodes[nodeId].conclusion,
                        descendants: proofNodes[nodeId].descendants,
                        childNodes: [],
                        rule: proofNodes[nodeId].rule,
                        conclusion: proofNodes[nodeId].conclusion,
                        args: proofNodes[nodeId].args,
                    };
                }),
        );
    };

    hiddenNodesTree = (list: Array<TreeNode>): Array<TreeNode> => {
        const map: { [n: number]: number } = {},
            roots: Array<TreeNode> = [];
        let node, i;

        for (i = 0; i < list.length; i += 1) {
            map[list[i].id] = i;
            list[i].childNodes = [];
        }

        for (i = 0; i < list.length; i += 1) {
            node = list[i];
            if (node.parentId !== NaN && list[map[node.parentId]]) {
                list[map[node.parentId]].childNodes.push(node);
            } else {
                roots.push(node);
            }
        }
        return roots;
    };

    recursivelyGetChildren = (nodeId: number): Array<number> => {
        const { proofNodes } = this.state;
        let nodes: Array<number> = [];
        proofNodes[nodeId].children.forEach((node) => {
            nodes = nodes.concat([node]);
            nodes = nodes.concat(this.recursivelyGetChildren(node));
        });
        return nodes;
    };

    foldAllDescendants = (): void => {
        const { nodeOnFocus } = this.state;
        const { foldAllDescendants } = this.props;
        foldAllDescendants(nodeOnFocus);
    };

    changeNodeColor = (color: string): void => {
        const { showingNodes, nodesSelected, nodeOnFocus } = this.state;
        nodesSelected.forEach((nodeId) => {
            showingNodes[nodeId] = new Node({ ...showingNodes[nodeId].props, selected: false, color: color });
        });
        if (showingNodes[nodeOnFocus]) {
            showingNodes[nodeOnFocus] = new Node({ ...showingNodes[nodeOnFocus].props, color: color });
        }
        this.setState({ showingNodes, nodesSelected: [] });
    };

    downloadProof = (dot: string, proofName: string): void => {
        const link = document.createElement('a');
        link.download = proofName + '.json';
        link.href = `data:attachment/text,${encodeURIComponent(JSON.stringify(this.exportProof(dot)))}`;
        link.click();
    };

    exportProof = (dot = ''): { dot: string } => {
        // TODO
        return {
            dot: dot,
        };
    };

    render(): JSX.Element {
        const { canvasSize, stage, showingNodes, showingEdges, nodesSelected, nodeOnFocus, proofNodes } = this.state;
        const color = showingNodes[nodeOnFocus] ? showingNodes[nodeOnFocus].props.color : '';

        return (
            <>
                <Menu
                    unfold={this.unfold}
                    foldSelectedNodes={this.foldSelectedNodes}
                    foldAllDescendants={this.foldAllDescendants}
                    changeNodeColor={this.changeNodeColor}
                    options={{
                        unfold: showingNodes[nodeOnFocus] ? showingNodes[nodeOnFocus].props.rule === 'π' : false,
                        foldSelected: nodesSelected.length && nodesSelected.includes(nodeOnFocus) ? true : false,
                        foldAllDescendants: proofNodes[nodeOnFocus] && proofNodes[nodeOnFocus].children.length > 0,
                    }}
                    currentColor={color}
                ></Menu>
                <Stage
                    draggable
                    width={canvasSize.width}
                    height={canvasSize.height}
                    onWheel={(e) => this.setState({ stage: handleWheel(e) })}
                    scaleX={stage.stageScale}
                    scaleY={stage.stageScale}
                    x={stage.stageX}
                    y={stage.stageY}
                    onContextMenu={(e) => e.evt.preventDefault()}
                >
                    <Layer>
                        {Object.keys(showingEdges).length > 0 &&
                            Object.keys(showingEdges).map(function (key) {
                                return showingEdges[key];
                            })}
                        {Object.keys(showingNodes).length > 0 &&
                            Object.keys(showingNodes).map(
                                (value: string): JSX.Element => showingNodes[parseInt(value)].render(),
                            )}
                    </Layer>
                </Stage>
            </>
        );
    }
}

function mapStateToProps(state: { file: FileState; proof: ProofState; theme: ThemeState }, ownProps: CanvasProps) {
    return {
        myProof: selectProof(state),
        myView: state.proof.view,
        proofNodes: ownProps.proofNodes,
        openDrawer: ownProps.openDrawer,
        view: ownProps.view ? ownProps.view : undefined,
        importedData: ownProps.importedData,
    };
}

const mapDispatchToProps = { hideNodes, unhideNodes, foldAllDescendants, applyView };

export default connect(mapStateToProps, mapDispatchToProps)(Canvas);
