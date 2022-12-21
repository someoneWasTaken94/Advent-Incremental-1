import { Application } from "@pixi/app";
import { Assets } from "@pixi/assets";
import { Resource, Texture } from "@pixi/core";
import { Container } from "@pixi/display";
import { Graphics } from "@pixi/graphics";
import { Matrix } from "@pixi/math";
import { Sprite } from "@pixi/sprite";
import { jsx } from "features/feature";
import { globalBus } from "game/events";
import { createLayer } from "game/layers";
import { Persistent, persistent, State } from "game/persistence";
import player from "game/player";
import { Direction } from "util/common";
import { computed, ComputedRef, reactive, ref, watchEffect } from "vue";
import conveyor from "./factory-components/conveyor.png";
import cursor from "./factory-components/cursor.jpg";
import rotate from "./factory-components/rotate_rectangle.png";
import square from "./factory-components/square.jpg";
import Factory from "./Factory.vue";
import "./styles/factory.css";

const id = "factory";

// what is the actual day?
const day = 20;

// 20x20 block size
// TODO: unhardcode stuff

enum FactoryDirections {
    Any = "ANY",
    None = "NONE"
}
type FactoryDirection = FactoryDirections | Direction;

function roundDownTo(num: number, multiple: number) {
    return Math.floor((num + multiple / 2) / multiple) * multiple;
}
function getRelativeCoords(e: MouseEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}
function iterateDirection(dir: FactoryDirection, func: (dir: FactoryDirection) => void) {
    switch (dir) {
        case FactoryDirections.None:
            return;
        case FactoryDirections.Any:
            func(Direction.Up);
            func(Direction.Right);
            func(Direction.Down);
            func(Direction.Left);
            break;
        default:
            func(dir);
    }
}
function rotateDir(dir: Direction, relative = Direction.Right) {
    const directions = [Direction.Up, Direction.Right, Direction.Down, Direction.Left];
    let index = directions.indexOf(dir);
    index += directions.indexOf(relative);
    index = index % directions.length;
    return directions[index];
}
function directionToNum(dir: Direction) {
    switch (dir) {
        case Direction.Left:
        case Direction.Up:
            return -1;
        case Direction.Right:
        case Direction.Down:
            return 1;
    }
}
function getDirection(dir: Direction) {
    switch (dir) {
        case Direction.Left:
        case Direction.Right:
            return "h";
        case Direction.Up:
        case Direction.Down:
            return "v";
    }
}

const factorySize = {
    width: 6,
    height: 6
};
const blockSize = 50;

const factory = createLayer(id, () => {
    // layer display
    const name = "The Factory";
    const color = "grey";

    // ---------------------------------------------- Components

    const FACTORY_COMPONENTS = {
        cursor: {
            imageSrc: cursor,
            name: "Cursor",
            description: "Use this to move.",
            tick: 0,
            consumption: {},
            consumptionStock: {},
            production: {},
            productionStock: {}
        },
        rotate: {
            imageSrc: rotate,
            name: "Rotate",
            description: "Use this to rotate components.",
            tick: 0,
            consumption: {},
            consumptionStock: {},
            production: {},
            productionStock: {}
        },
        conveyor: {
            imageSrc: conveyor,
            name: "Conveyor",
            description: "Moves 1 item per tick.",
            tick: 1,
            consumption: {},
            consumptionStock: {},
            production: {},
            productionStock: {},
            ports: {
                [Direction.Left]: {
                    type: "input"
                },
                [Direction.Right]: {
                    type: "output"
                }
            }
        },
        square: {
            imageSrc: square,
            name: "???",
            description: "Produces 1 square every 1 tick.",
            tick: 1,
            production: {
                square: 1
            },
            productionStock: {
                square: Infinity
            },
            consumption: {},
            consumptionStock: {}
        }
    } as Record<string, FactoryComponentDeclaration>;
    const RESOURCES = {
        square: square
    } as Record<string, string>;

    type FactoryCompNames = keyof typeof FACTORY_COMPONENTS;
    type BuildableCompName = Exclude<FactoryCompNames, "cursor">;

    interface FactoryComponentBase extends Record<string, State> {
        direction: Direction;
    }

    interface FactoryComponentProducer extends FactoryComponentBase {
        type: Exclude<BuildableCompName, "conveyor">;
        consumptionStock: Record<string, number>;

        // current production stock
        productionStock: Record<string, number>;
        ticksDone: number;
    }

    interface FactoryComponentConveyor extends FactoryComponentBase {
        type: "conveyor";
    }

    type FactoryComponent = FactoryComponentBase &
        (FactoryComponentConveyor | FactoryComponentProducer);

    interface FactoryComponentDeclaration {
        tick: number;
        imageSrc: string;
        name: string;
        description: string;

        /** amount it consumes */
        consumption: Record<string, number>;
        /** maximum stock of consumption */
        consumptionStock: Record<string, number>;
        /** amount it produces */
        production: Record<string, number>;
        /** maximum stock of production */
        productionStock: Record<string, number>;

        /** on produce, do something */
        onProduce?: (times: number) => void;
        /** can it produce? (in addtion to the stock check) */
        canProduce?: ComputedRef<boolean>;
    }

    interface FactoryInternalBase {
        sprite: Sprite;
        canProduce: ComputedRef<boolean>;
    }
    interface FactoryInternalConveyor extends FactoryInternalBase {
        type: "conveyor";

        // packages are sorted by last first, first last
        // [componentMade5SecondsAgo, componentMade4SecondsAgo...]
        packages: Block[];
        nextPackages: Block[];
    }
    interface FactoryInternalProducer extends FactoryInternalBase {
        type: Exclude<BuildableCompName, "conveyor">;
    }
    type FactoryInternal = FactoryInternalConveyor | FactoryInternalProducer;

    interface Block {
        sprite: Sprite;
        type: string;
        // in block amts, not screen
        x: number;
        y: number;
        lastX: number;
        lastY: number;
    }

    // mouse positions
    const mouseCoords = reactive({
        x: 0,
        y: 0
    });
    const mapOffset = reactive({
        x: 0,
        y: 0
    });
    const isMouseHoverShown = ref(false);

    const isComponentHover = ref(false);
    const whatIsHovered = ref<FactoryCompNames | "">("");

    const compSelected = ref<FactoryCompNames>("cursor");
    const components: Persistent<{ [key: string]: FactoryComponent }> = persistent({});
    const compInternalData: Record<string, FactoryInternal> = {};

    // pixi
    const app = new Application({
        backgroundAlpha: 0
    });
    const graphicContainer = new Graphics();
    let spriteContainer = new Container();
    const movingBlocks = new Container();

    spriteContainer.zIndex = 0;
    movingBlocks.zIndex = 1;
    graphicContainer.zIndex = 2;
    app.stage.addChild(graphicContainer, spriteContainer, movingBlocks);
    app.stage.sortableChildren = true;
    let loaded = false;

    globalBus.on("onLoad", async () => {
        loaded = false;

        spriteContainer.destroy({
            children: true
        });
        spriteContainer = new Container();
        app.stage.addChild(spriteContainer);

        const floorGraphics = new Graphics();
        floorGraphics.beginFill(0x70645d);
        floorGraphics.drawRect(
            (-factorySize.width - 0.5) * blockSize,
            (-factorySize.height - 0.5) * blockSize,
            factorySize.width * 2 * blockSize,
            factorySize.height * 2 * blockSize
        );
        floorGraphics.endFill();
        spriteContainer.addChild(floorGraphics);

        // load every sprite here so pixi doesn't complain about loading multiple times
        await Assets.load(Object.values(FACTORY_COMPONENTS).map(x => x.imageSrc));

        if (Array.isArray(components.value)) {
            components.value = {};
        } else {
            for (const id in components.value) {
                const data = components.value[id];
                console.log(id, data);
                if (data?.type === undefined) {
                    delete components.value[id];
                    continue;
                }
                const [x, y] = id.split("x").map(p => +p);
                addFactoryComp(x, y, data);
            }
        }

        loaded = true;
    });
    (window as any).internal = compInternalData;
    (window as any).comp = components;
    (window as any).blocks = movingBlocks;
    let taskIsRunning = false;

    globalBus.on("update", async diff => {
        if (taskIsRunning || !loaded) return;
        taskIsRunning = true;
        //debugger
        // will change soon:tm:
        const tick = diff;
        // make them produce
        for (const id in components.value) {
            const [x, y] = id.split("x").map(p => +p);
            const _data = components.value[id];
            const _compData = compInternalData[id];
            if (_data === undefined || _compData === undefined) continue;
            const factoryData = FACTORY_COMPONENTS[_data.type];
            //debugger;
            if (_data.type === "conveyor") {
                const data = _data as FactoryComponentConveyor;
                const compData = _compData as FactoryInternalConveyor;
                if (compData.type !== "conveyor") throw new TypeError("this should not happen");
                // conveyor part
                // use a copy
                //console.log(compData);
                compData.packages = compData.packages.concat(compData.nextPackages);
                compData.nextPackages = [];
                for (const [key, block] of [...compData.packages].entries()) {
                    const inputDirection = rotateDir(data.direction, Direction.Left);
                    const dirType = getDirection(inputDirection);
                    const dirAmt = directionToNum(inputDirection);
                    if (dirType === "h") {
                        if (block.x <= block.lastX + dirAmt) {
                            const compBehind = compInternalData[x + dirAmt + "x" + y];
                            const storedComp = components.value[x + dirAmt + "x" + y];

                            // empty spot
                            if (compBehind === undefined) {
                                // just delete it
                                movingBlocks.removeChild(block.sprite);
                                compData.packages.splice(key, 1);
                            } else if (compBehind.type === "conveyor") {
                                // push it to the next conveyor, kill it from the
                                // curent conveyor
                                block.lastX += dirAmt;
                                (compBehind as FactoryInternalConveyor).nextPackages.push(block);
                                compData.packages.splice(key, 1);
                            } else {
                                // send it to the factory
                                // destory its sprite and data
                                const factoryData = storedComp as FactoryComponentProducer;
                                factoryData.consumptionStock[block.type]++;
                                movingBlocks.removeChild(block.sprite);
                                compData.packages.splice(key, 1);
                            }
                        } else {
                            const change =
                                dirAmt * Math.min(Math.abs(block.x + 1 - block.lastX), tick);
                            block.x += change;
                            block.sprite.x += change * blockSize;
                        }
                    } else {
                        if (block.y <= block.lastY + dirAmt) {
                            const compBehind = compInternalData[x + "x" + (y + dirAmt)];
                            const storedComp = components.value[x + "x" + (y + dirAmt)];

                            // empty spot
                            if (compBehind === undefined) {
                                // just delete it
                                movingBlocks.removeChild(block.sprite);
                                compData.packages.splice(key, 1);
                            } else if (compBehind.type === "conveyor") {
                                // push it to the next conveyor, kill it from the
                                // curent conveyor
                                block.lastY += dirAmt;
                                (compBehind as FactoryInternalConveyor).nextPackages.push(block);
                                compData.packages.splice(key, 1);
                            } else {
                                // send it to the factory
                                // destory its sprite and data
                                const factoryData = storedComp as FactoryComponentProducer;
                                factoryData.consumptionStock[block.type]++;
                                movingBlocks.removeChild(block.sprite);
                                compData.packages.splice(key, 1);
                            }
                        } else {
                            const change = dirAmt * Math.min(Math.abs(block.y - block.lastY), tick);
                            block.y += change;
                            block.sprite.y += change * blockSize;
                        }
                    }
                }
            } else {
                const data = _data as FactoryComponentProducer;
                const compData = _compData as FactoryInternalProducer;
                // factory part
                // PRODUCTION
                if (data.ticksDone >= factoryData.tick) {
                    if (!compData.canProduce.value) continue;
                    const cyclesDone = Math.floor(data.ticksDone / factoryData.tick);
                    factoryData.onProduce?.(cyclesDone);
                    for (const [key, val] of Object.entries(factoryData.consumption)) {
                        data.consumptionStock[key] -= val;
                    }
                    for (const [key, val] of Object.entries(factoryData.production)) {
                        data.productionStock[key] += val;
                    }
                    data.ticksDone -= cyclesDone * factoryData.tick;
                } else {
                    data.ticksDone += tick;
                }
                // now look at each component direction and see if it accepts items coming in
                // components are 1x1 so simple math for now

                let yInc = 0;
                let xInc = 0;
                if (
                    components.value[x + "x" + (y + 1)]?.type === "conveyor" &&
                    components.value[x + "x" + (y + 1)].direction === Direction.Up
                ) {
                    yInc = 1;
                } else if (
                    components.value[x + "x" + (y - 1)]?.type === "conveyor" &&
                    components.value[x + "x" + (y - 1)].direction === Direction.Down
                ) {
                    yInc = -1;
                } else if (
                    components.value[x + 1 + "x" + y]?.type === "conveyor" &&
                    components.value[x + 1 + "x" + y].direction === Direction.Right
                ) {
                    xInc = 1;
                } else if (
                    components.value[x - 1 + "x" + y]?.type === "conveyor" &&
                    components.value[x - 1 + "x" + y].direction === Direction.Left
                ) {
                    xInc = -1;
                }
                // no suitable location to dump stuff in
                console.log(x, y);
                debugger;
                if (xInc === 0 && yInc === 0) continue;
                let itemToMove: [string, number] | undefined = undefined;
                for (const [name, amt] of Object.entries(data.productionStock)) {
                    if (amt >= 1) {
                        itemToMove = [name, amt];
                        data.productionStock[name]--;
                        break;
                    }
                }
                // there is nothing to move
                if (itemToMove === undefined) continue;
                const texture = Assets.get(RESOURCES[itemToMove[0]]);
                const sprite = new Sprite(texture);

                /*
                    go left     go right
                              go top
                                x
                    default -> CCC
                             x CCC x
                               CCC
                                x
                              go bottom
                    */
                // if X is being moved, then we don't need to adjust x
                // however it needs to be aligned if Y is being moved
                // vice-versa
                const spriteDiffX = xInc !== 0 ? 0 : 0.5;
                const spriteDiffY = yInc !== 0 ? 0 : 0.5;
                sprite.x = (x + spriteDiffX) * blockSize;
                sprite.y = (y + spriteDiffY) * blockSize;
                sprite.anchor.set(0.5);
                sprite.width = blockSize / 2.5;
                sprite.height = blockSize / 5;
                //console.log(sprite);
                const block: Block = {
                    sprite,
                    x: x,
                    y: y,
                    lastX: x,
                    lastY: y,
                    type: itemToMove[0]
                };

                (
                    compInternalData[x + xInc + "x" + (y + yInc)] as FactoryInternalConveyor
                ).nextPackages.push(block);
                movingBlocks.addChild(sprite);
            }
        }
        taskIsRunning = false;
    });

    function addFactoryComp(
        x: number,
        y: number,
        data: Partial<FactoryComponent> & { type: BuildableCompName }
    ) {
        if (x < -factorySize.width || x >= factorySize.width) return;
        if (y < -factorySize.height || y >= factorySize.height) return;

        const factoryBaseData = FACTORY_COMPONENTS[data.type];
        const sheet = Assets.get(factoryBaseData.imageSrc);
        const sprite = new Sprite(sheet);

        sprite.x = x * blockSize;
        sprite.y = y * blockSize;
        sprite.width = blockSize;
        sprite.height = blockSize;
        sprite.anchor.x = 0.5;
        sprite.anchor.y = 0.5;
        sprite.rotation =
            ([Direction.Right, Direction.Down, Direction.Left, Direction.Up].indexOf(
                data.direction ?? Direction.Right
            ) *
                Math.PI) /
            2;
        console.log("!!", data, sprite);
        components.value[x + "x" + y] = {
            ticksDone: 0,
            direction: Direction.Right,
            consumptionStock:
                data.type === "conveyor"
                    ? undefined
                    : Object.fromEntries(
                          Object.keys(factoryBaseData.consumptionStock).map(i => [i, 0])
                      ),
            productionStock:
                data.type === "conveyor"
                    ? undefined
                    : Object.fromEntries(
                          Object.keys(factoryBaseData.productionStock).map(i => [i, 0])
                      ),
            ...data
        } as FactoryComponent;
        const isConveyor = data.type === "conveyor";
        compInternalData[x + "x" + y] = {
            type: data.type,
            packages: isConveyor ? [] : undefined,
            nextPackages: isConveyor ? [] : undefined,
            canProduce: computed(() => {
                if (data.type === "conveyor") return true;
                if (!(factoryBaseData.canProduce?.value ?? true)) return false;
                // this should NEVER be null
                const compData = components.value[x + "x" + y] as FactoryComponentProducer;
                for (const [key, res] of Object.entries(compData.productionStock)) {
                    // if the current stock + production is more than you can handle
                    if (
                        res + factoryBaseData.production[key] >
                        factoryBaseData.productionStock[key]
                    )
                        return false;
                }
                for (const [key, res] of Object.entries(compData.consumptionStock)) {
                    // make sure you have enough to produce
                    if (res < factoryBaseData.consumptionStock[key]) return false;
                }
                return true;
            }),
            sprite
        } as FactoryInternalProducer;
        spriteContainer.addChild(sprite);
    }

    // draw graphics
    function updateGraphics() {
        app.resize();
        graphicContainer.clear();
        // make (0, 0) the center of the screen
        const calculatedX = mapOffset.x * blockSize + app.view.width / 2;
        const calculatedY = mapOffset.y * blockSize + app.view.height / 2;

        spriteContainer.x = movingBlocks.x = calculatedX;
        spriteContainer.y = movingBlocks.y = calculatedY;

        if (
            isMouseHoverShown.value &&
            compSelected.value !== "cursor" &&
            compSelected.value !== "rotate"
        ) {
            const { tx, ty } = spriteContainer.localTransform;
            graphicContainer.lineStyle(4, 0x808080, 1);
            graphicContainer.drawRect(
                roundDownTo(mouseCoords.x - tx, blockSize) + tx - blockSize / 2,
                roundDownTo(mouseCoords.y - ty, blockSize) + ty - blockSize / 2,
                blockSize,
                blockSize
            );
        }
    }
    watchEffect(updateGraphics);

    const pointerDown = ref(false),
        pointerDrag = ref(false),
        compHovered = ref<FactoryComponent | undefined>(undefined);

    function onFactoryPointerMove(e: PointerEvent) {
        const { x, y } = getRelativeCoords(e);
        mouseCoords.x = x;
        mouseCoords.y = y;

        if (
            pointerDown.value &&
            (pointerDrag.value ||
                (compSelected.value === "cursor" &&
                    (Math.abs(e.movementX) > 2 || Math.abs(e.movementY) > 2)))
        ) {
            pointerDrag.value = true;
            mapOffset.x += e.movementX / blockSize;
            mapOffset.y += e.movementY / blockSize;
            // the maximum you can see currently
            // total size of blocks - current size = amount you should move
            mapOffset.x = Math.min(
                Math.max(mapOffset.x, -factorySize.width + 0.5),
                factorySize.width + 0.5
            );
            mapOffset.y = Math.min(
                Math.max(mapOffset.y, -factorySize.height + 0.5),
                factorySize.height + 0.5
            );
        }
        if (!pointerDown.value && !pointerDrag.value) {
            const { tx, ty } = spriteContainer.localTransform;
            compHovered.value =
                components.value[
                    Math.round(roundDownTo(x - tx, blockSize) / blockSize) +
                        "x" +
                        Math.round(roundDownTo(y - ty, blockSize) / blockSize)
                ];
        }
    }
    function onFactoryPointerDown(e: PointerEvent) {
        window.addEventListener("pointerup", onFactoryPointerUp);
        pointerDown.value = true;
        if (e.button === 1) {
            pointerDrag.value = true;
        }
    }
    function onFactoryPointerUp(e: PointerEvent) {
        // make sure they're not dragging and that
        // they aren't trying to put down a cursor
        if (!pointerDrag.value) {
            const { tx, ty } = spriteContainer.localTransform;
            let { x, y } = getRelativeCoords(e);
            x = roundDownTo(x - tx, blockSize) / blockSize;
            y = roundDownTo(y - ty, blockSize) / blockSize;
            if (e.button === 0) {
                if (compSelected.value === "rotate") {
                    if (
                        components.value[x + "x" + y] != null &&
                        components.value[x + "x" + y].direction != null
                    ) {
                        components.value[x + "x" + y] = {
                            ...components.value[x + "x" + y],
                            direction: rotateDir(
                                (components.value[x + "x" + y] as FactoryComponentConveyor)
                                    .direction
                            )
                        };
                        compInternalData[x + "x" + y].sprite.rotation += Math.PI / 2;
                    }
                } else if (compSelected.value !== "cursor") {
                    if (components.value[x + "x" + y] == null) {
                        addFactoryComp(x, y, { type: compSelected.value });
                    }
                }
            } else if (e.button === 2) {
                const data = compInternalData[x + "x" + y];
                if (data === undefined) return;
                delete components.value[x + "x" + y];
                spriteContainer.removeChild(data.sprite);
            }
        }

        window.removeEventListener("pointerup", onFactoryPointerUp);
        pointerDown.value = pointerDrag.value = false;
    }
    function onFactoryMouseEnter() {
        isMouseHoverShown.value = true;
    }
    function onFactoryMouseLeave() {
        isMouseHoverShown.value = false;
    }

    function onComponentMouseEnter(name: FactoryCompNames | "") {
        whatIsHovered.value = name;
        isComponentHover.value = true;
    }
    function onComponentMouseLeave() {
        isComponentHover.value = false;
    }
    function onCompClick(name: FactoryCompNames) {
        compSelected.value = name;
    }

    function goBack() {
        player.tabs.splice(0, Infinity, "main");
    }
    return {
        name,
        day,
        color,
        minWidth: 700,
        minimizable: false,
        style: { overflow: "hidden" },
        components,
        display: jsx(() => (
            <div class="layer-container">
                <button class="goBack" onClick={goBack}>
                    ❌
                </button>
                <Factory
                    application={app}
                    onPointermove={onFactoryPointerMove}
                    onPointerdown={onFactoryPointerDown}
                    onPointerenter={onFactoryMouseEnter}
                    onPointerleave={onFactoryMouseLeave}
                    onContextmenu={(e: MouseEvent) => e.preventDefault()}
                />

                {compHovered.value !== undefined ? (
                    <div
                        class="info-container"
                        style={{
                            left: mouseCoords.x + "px",
                            top: mouseCoords.y + "px"
                        }}
                    >
                        <h3>{FACTORY_COMPONENTS[compHovered.value.type].name}</h3>
                        <br />
                        {FACTORY_COMPONENTS[compHovered.value.type].description}
                        <br />
                        {compHovered.value.type !== "conveyor" ? (
                            <>
                                Stock:{" "}
                                {Object.entries({
                                    ...(compHovered.value.productionStock as Record<
                                        string,
                                        number
                                    >),
                                    ...(compHovered.value.consumptionStock as Record<
                                        string,
                                        number
                                    >)
                                }).map(i => {
                                    return `${i[0]}: ${i[1]}/${
                                        FACTORY_COMPONENTS[compHovered.value?.type ?? "cursor"]
                                            .consumptionStock[i[0]] ??
                                        FACTORY_COMPONENTS[compHovered.value?.type ?? "cursor"]
                                            .productionStock[i[0]]
                                    }`;
                                })}
                            </>
                        ) : undefined}
                    </div>
                ) : undefined}

                <div class="factory-container">
                    <div
                        class={{
                            "comp-info": true,
                            active: isComponentHover.value
                        }}
                        style={{
                            top:
                                Math.max(
                                    Object.keys(FACTORY_COMPONENTS).indexOf(whatIsHovered.value),
                                    0
                                ) *
                                    50 +
                                10 +
                                "px"
                        }}
                    >
                        {whatIsHovered.value === "" ? undefined : (
                            <>
                                <h3>{FACTORY_COMPONENTS[whatIsHovered.value].name}</h3>
                                <br />
                                {FACTORY_COMPONENTS[whatIsHovered.value].description}
                            </>
                        )}
                    </div>
                    <div class="comp-list">
                        {Object.entries(FACTORY_COMPONENTS).map(value => {
                            const key = value[0] as FactoryCompNames;
                            const item = value[1];
                            return (
                                <img
                                    src={item.imageSrc}
                                    class={{ selected: compSelected.value === key }}
                                    onMouseenter={() => onComponentMouseEnter(key)}
                                    onMouseleave={() => onComponentMouseLeave()}
                                    onClick={() => onCompClick(key)}
                                ></img>
                            );
                        })}
                    </div>
                </div>
            </div>
        ))
    };
});
export default factory;
