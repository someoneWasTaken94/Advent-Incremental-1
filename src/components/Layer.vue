<template>
    <div class="layer-container" :style="{ '--layer-color': unref(color) }">
        <button v-if="showGoBack" class="goBack" @click="goBack">❌</button>

        <button class="layer-tab minimized" v-if="minimized" @click="setMinimized(false)">
            <component v-if="minimizedComponent" :is="minimizedComponent" />
            <div v-else>{{ unref(name) }}</div>
        </button>
        <div class="layer-tab" :class="{ showGoBack }" v-else>
            <Context @update-nodes="updateNodes">
                <component :is="component" />
            </Context>
        </div>

        <button v-if="unref(minimizable)" class="minimize" @click="setMinimized(true)">▼</button>
    </div>
</template>

<script lang="ts">
import projInfo from "data/projInfo.json";
import type { CoercableComponent } from "features/feature";
import type { FeatureNode } from "game/layers";
import type { Persistent } from "game/persistence";
import player from "game/player";
import { computeComponent, computeOptionalComponent, processedPropType, wrapRef } from "util/vue";
import type { PropType, Ref } from "vue";
import { computed, defineComponent, nextTick, toRefs, unref, watch } from "vue";
import Context from "./Context.vue";

export default defineComponent({
    components: { Context },
    props: {
        index: {
            type: Number,
            required: true
        },
        tab: {
            type: Function as PropType<() => HTMLElement | undefined>,
            required: true
        },
        display: {
            type: processedPropType<CoercableComponent>(Object, String, Function),
            required: true
        },
        minimizedDisplay: processedPropType<CoercableComponent>(Object, String, Function),
        minimized: {
            type: Object as PropType<Persistent<boolean>>,
            required: true
        },
        minWidth: {
            type: processedPropType<number | string>(Number, String),
            required: true
        },
        name: {
            type: processedPropType<string>(String),
            required: true
        },
        color: processedPropType<string>(String),
        minimizable: processedPropType<boolean>(Boolean),
        nodes: {
            type: Object as PropType<Ref<Record<string, FeatureNode | undefined>>>,
            required: true
        }
    },
    setup(props) {
        const { display, index, minimized, minWidth, tab, minimizedDisplay, name } = toRefs(props);

        const component = computeComponent(display);
        const minimizedComponent = computeOptionalComponent(minimizedDisplay);
        const showGoBack = computed(
            () => projInfo.allowGoBack && index.value > 0 && !minimized.value
        );

        function goBack() {
            player.tabs.splice(unref(props.index), 1);
        }

        function setMinimized(min: boolean) {
            minimized.value = min;
        }

        nextTick(() => updateTab(minimized.value, unref(minWidth.value)));
        watch([name, minimized, wrapRef(minWidth)], ([name, minimized, minWidth]) => {
            updateTab(minimized, minWidth);
        });

        function updateNodes(nodes: Record<string, FeatureNode | undefined>) {
            props.nodes.value = nodes;
        }

        function updateTab(min: boolean, minWidth: number | string) {
            minimized.value = min;
            const width =
                typeof minWidth === "number" || Number.isNaN(parseInt(minWidth))
                    ? minWidth + "px"
                    : minWidth;
            const tabValue = tab.value();
            if (tabValue != undefined) {
                if (min) {
                    tabValue.style.flexGrow = "0";
                    tabValue.style.flexShrink = "0";
                    tabValue.style.width = "60px";
                    tabValue.style.minWidth = tabValue.style.flexBasis = "";
                    tabValue.style.margin = "0";
                } else {
                    tabValue.style.flexGrow = "";
                    tabValue.style.flexShrink = "";
                    tabValue.style.width = "";
                    tabValue.style.minWidth = tabValue.style.flexBasis = width;
                    tabValue.style.margin = "";
                }
            }
        }

        return {
            component,
            minimizedComponent,
            showGoBack,
            updateNodes,
            unref,
            goBack,
            setMinimized,
            minimized,
            minWidth
        };
    }
});
</script>

<style scoped>

.layer-tab:not(.minimized) {
    padding-top: 20px;
    padding-bottom: 20px;
    min-height: 100%;
    flex-grow: 1;
    text-align: center;
    position: relative;
}

.inner-tab > .layer-container > .layer-tab:not(.minimized) {
    padding-top: 50px;
}

.layer-tab.minimized {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    padding: 0;
    padding-top: 55px;
    margin: 0;
    cursor: pointer;
    font-size: 40px;
    color: var(--foreground);
    border: none;
    background-color: transparent;
}

.layer-tab.minimized > * {
    margin: 0;
    writing-mode: vertical-rl;
    text-align: left;
    padding-left: 10px;
    width: 50px;
}

.inner-tab > .layer-container > .layer-tab:not(.minimized) {
    margin: -50px -10px;
    padding: 50px 10px;
}

.modal-body .layer-tab {
    padding-bottom: 0;
}

.modal-body .layer-tab:not(.hasSubtabs) {
    padding-top: 0;
}

.minimize {
    position: sticky;
    top: 6px;
    right: 9px;
    z-index: 7;
    line-height: 30px;
    border: none;
    background: var(--background);
    box-shadow: var(--background) 0 2px 3px 5px;
    border-radius: 50%;
    color: var(--foreground);
    font-size: 40px;
    cursor: pointer;
    margin-top: -44px;
    margin-right: -30px;
}

.minimized + .minimize {
    transform: rotate(-90deg);
    top: 10px;
    right: 18px;
    pointer-events: none;
}
</style>
<style>
.layer-tab.minimized > * > .desc {
    color: var(--accent1);
    font-size: 30px;
}
</style>
