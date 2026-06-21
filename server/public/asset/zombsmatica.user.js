// ==UserScript==
// @name         Zombsmatica
// @namespace    -
// @version      2026-04-08
// @description  A standalone script. Build bases in a sandbox or in-game, export them as files, and import them as blueprints.
// @author       ehScripts
// @match        *://localhost/
// @match        *://zombs.io/
// @match        https://lbbzombs.github.io/zombs-server-spots/
// @icon         data:image/png;base64,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
// ==/UserScript==

(() => {
    'use strict';

    /* ==== MAIN FUNCTIONS ==== */

    const TILE_PX = 48;

    const quantizePos = pos => ({
        x: Math.round(pos.x / TILE_PX) * TILE_PX,
        y: Math.round(pos.y / TILE_PX) * TILE_PX
    });
    const getWorldMousePos = () => game.renderer.screenToWorld(game.ui.mousePosition.x, game.ui.mousePosition.y);
    const getQuantizedWorldMousePos = () => quantizePos(getWorldMousePos());

    const getEntities = () => game.world.entities instanceof Map ? game.world.entities.values() : Object.values(game.world.entities);
    const getEntity = uid => game.world.entities instanceof Map ? game.world.entities.get(uid) : game.world.entities[uid];

    const getGoldStashPos = () => getEntities().find(entity => entity.fromTick.partyId === game.ui.playerPartyId && entity.fromTick.model === "GoldStash")?.fromTick.position;

    // ==== OVERLAY CLASS ====

    class Overlay {
        constructor() {
            this.buildings = new Map();
            this.isOpen = false;

            this.fixedPos = null;
            this.isDragging = false;

            this.addHandlers();
        };

        getAlpha() {
            return (this.fixedPos && !this.isDragging) ? 0.5 : 0.2;
        };

        enable() {
            this.isOpen = true;
            for(const [uid, building] of this.buildings) {
                getEntity(uid).currentModel.setAlpha(this.getAlpha());
            };
        };

        disable() {
            this.isOpen = false;
            for(const [uid, building] of this.buildings) {
                getEntity(uid).currentModel.setAlpha(0);
            };
        };

        reset() {
            for(const [uid, building] of this.buildings) {
                game.world[this._removeEntityKey](uid);
            };
            this.buildings.clear();
            this.fixedPos = null;
            this.isDragging = false;
        };

        update(goldStashPos) {
            if(!goldStashPos) {
                goldStashPos = getEntities().find(entity => entity.fromTick.partyId === game.ui.playerPartyId && entity.fromTick.model === "GoldStash")?.fromTick.position;
            };

            if(goldStashPos && !this.fixedPos) {
                this.fixedPos = goldStashPos;
            };

            let referencePos = this.isDragging ? getQuantizedWorldMousePos() : (this.fixedPos || getQuantizedWorldMousePos());

            const uidsToRemove = new Set();
            for(const [uid, building] of this.buildings) {
                let buildingEntity = getEntity(uid);

                if(goldStashPos && building.model === "GoldStash") {
                    uidsToRemove.add(uid);
                    if(buildingEntity) {
                        game.world.removeEntity(uid);
                    };
                    continue;
                };

                const position = {
                    x: referencePos.x + building.xOffset,
                    y: referencePos.y + building.yOffset
                };

                if(buildingEntity) {
                    game.world.updateEntity(uid, { position });
                    buildingEntity.fromTick.position = position; // addition to prevent discrepancy between fromTick and targetTick
                } else {
                    game.world.createEntity({
                        uid,
                        entityClass: "Prop",
                        position,
                        towerYaw: building.yaw,
                        ...building
                    });
                    buildingEntity = getEntity(uid);
                };
                if(buildingEntity) {
                    buildingEntity.currentModel.setAlpha(this.getAlpha());
                };
            };
            for(const [uid, building] of this.buildings) {
                if (uidsToRemove.has(uid)) {
                    if (getEntity(uid)) { game.world[this._removeEntityKey](uid); };
                    this.buildings.delete(uid);
                };
            };
        };

        handleMouseDown(e) {
            if(!this.isOpen || e.target.id !== "hud" || this.buildings.size < 1) { return; };

            if(!this.fixedPos) {
                this.fixedPos = getQuantizedWorldMousePos();
                this.update();
                return;
            };

            const worldMousePos = getWorldMousePos();
            if(!this.isDragging && worldMousePos.x >= (this.fixedPos.x - TILE_PX) && worldMousePos.x <= (this.fixedPos.x + TILE_PX) && worldMousePos.y >= (this.fixedPos.y - TILE_PX) && worldMousePos.y <= (this.fixedPos.y + TILE_PX)) {
                this.isDragging = true;
            };
        };

        handleMouseMove(e) {
            if(!this.isOpen || this.buildings.size < 1) { return; };

            if(this.isDragging || !this.fixedPos) {
                this.update();
            };
        };

        handleMouseUp(e) {
            if(!this.isOpen || this.buildings.size < 1) { return; };

            if(this.isDragging || !this.fixedPos) {
                this.isDragging = false;
                this.fixedPos = getQuantizedWorldMousePos();
                this.update();
            };
        };

        handleRpc(data) {
            if(data.name === "LocalBuilding") {
                const goldStash = data.response.find(building => building.type === "GoldStash");
                if(goldStash) {
                    this.isDragging = false;
                    this.fixedPos = { x: goldStash.x, y: goldStash.y };
                    this.update(this.fixedPos);
                };
            };
        };

        interceptEntityUpdate(data) {
            for(const uid of this.buildings.keys()) {
                data.entities[uid] = true;
            };
            this._oldEntityUpdateListener(data);
        };

        interceptRemoveEntity(uid) {
            if(this.buildings.has(parseInt(uid))) {
                return;
            };
            game.world[this._removeEntityKey](uid);
        };

        addHandlers() {
            this._handleMouseDown = this.handleMouseDown.bind(this);
            this._handleMouseMove = this.handleMouseMove.bind(this);
            this._handleMouseUp = this.handleMouseUp.bind(this);
            addEventListener("mousedown", this._handleMouseDown);
            addEventListener("mousemove", this._handleMouseMove);
            addEventListener("mouseup", this._handleMouseUp);

            this._handleRpc = this.handleRpc.bind(this);
            game.network.emitter.addListener("PACKET_RPC", this._handleRpc);

            this._oldEntityUpdateListener = game.network.emitter.listeners("PACKET_ENTITY_UPDATE")[0];
            game.network.emitter.removeListener("PACKET_ENTITY_UPDATE", this._oldEntityUpdateListener);
            this._interceptEntityUpdate = this.interceptEntityUpdate.bind(this);
            game.network.emitter.addListener("PACKET_ENTITY_UPDATE", this._interceptEntityUpdate);

            this._removeEntityKey = Math.floor(Math.random() * 65536).toString(16);
            game.world[this._removeEntityKey] = game.world.removeEntity;
            game.world.removeEntity = this.interceptRemoveEntity.bind(this);
        };

        removeHandlers() {
            removeEventListener("mousedown", this._handleMouseDown);
            removeEventListener("mousemove", this._handleMouseMove);
            removeEventListener("mouseup", this._handleMouseUp);
            game.network.emitter.removeListener("PACKET_RPC", this._handleRpc);

            game.network.emitter.removeListener("PACKET_ENTITY_UPDATE", this._interceptEntityUpdate);
            game.network.emitter.addListener("PACKET_ENTITY_UPDATE", this._oldEntityUpdateListener);

            game.world.removeEntity = game.world[this._removeEntityKey];
            delete game.world[this._removeEntityKey];
        };
    };

    const overlay = new Overlay();

    /* ==== BASE EXPORT/IMPORT FUNCTIONS ==== */

    const BUILDING_MODELS = ["GoldStash", "Wall", "Door", "SlowTrap", "ArrowTower", "CannonTower", "MeleeTower", "BombTower", "MagicTower", "GoldMine", "Harvester"];

    const BUILDING_MODEL_INDEX = new Map(
        BUILDING_MODELS.map((model, i) => [model, i])
    );

    const exportBase = () => {
        let goldStashPos = getGoldStashPos();
        if(!goldStashPos) { return; };

        const entities = getEntities();
        let buildings = [];

        for(let { fromTick } of entities) {
            if(!BUILDING_MODEL_INDEX.has(fromTick.model) || fromTick.partyId !== game.ui.playerPartyId) { continue; };

            fromTick._xOffsetBits =
                Math.abs(
                (
                    (
                        fromTick.position.x
                        - game.ui.buildingSchema[fromTick.model].gridWidth * (TILE_PX / 2)
                    ) - goldStashPos.x
                ) / TILE_PX
            );
            fromTick._yOffsetBits = Math.abs(
                (
                    (
                        fromTick.position.y
                        - game.ui.buildingSchema[fromTick.model].gridHeight * (TILE_PX / 2)
                    ) - goldStashPos.y
                ) / TILE_PX
            );

            if(Math.max(fromTick._xOffsetBits, fromTick._yOffsetBits) >= (2 ** 5)) {
                continue;
            };

            buildings.push(fromTick);
        };

        // bit packing

        /*
        bit layout:
        [xxxxxsrr]
        [yyyyysmm]
        [mmttt___]
        ==========
        x = x offset
        y = y offset
        s = sign
        r = rotation (yaw)
        m = model
        t = tier
        _ = next building
        */

        let data = new Uint8Array(buildings.length * 3);

        for(let index = 0; index < buildings.length; index++) {
            const fromTick = buildings[index];

            const xOffsetBits = fromTick._xOffsetBits;
            const yOffsetBits = fromTick._yOffsetBits;

            data[index * 3] =
                xOffsetBits << 3
            | (fromTick.position.x > goldStashPos.x ? 0b100 : 0b000)
            | (fromTick.yaw / 90);
            data[index * 3 + 1] =
                yOffsetBits << 3
            | (fromTick.position.y > goldStashPos.y ? 0b100 : 0b000)
            | (BUILDING_MODEL_INDEX.get(fromTick.model) >> 2);
            data[index * 3 + 2] =
                (BUILDING_MODEL_INDEX.get(fromTick.model) & 0b0011) << 3
            | (fromTick.tier - 1);
        };

        const blob = new Blob([data], { type: "application/octet-stream" });

        const url = window.URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = `base_${Date.now()}.zombsmatica`;
        a.style.display = "none";

        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 100);
    };

    const importBase = () => {
        const input = document.createElement("input");

        input.type = "file";
        input.accept = ".zombsmatica";

        input.onchange = async e => {
            const file = e.target.files[0];
            if(!file) { return; };

            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);

            let newOverlayBuildings = new Map();

            try {
                // bit unpacking

                if(data.byteLength % 3 > 0) {
                    throw new Error("Invalid .zombsmatica file: Byte length not divisible by 3.");
                };

                for(let index = 0; index < data.length; index += 3) {
                    const model = BUILDING_MODELS[((data[index + 1] & 0b00000011) << 2) | (data[index + 2] >> 3)];
                    if(!model || !game.ui.buildingSchema[model]) { throw new Error(`Invalid model at index ${index}`); };

                    const xSide = ((data[index] & 0b00000100) >> 2) * 2 - 1;
                    const ySide = ((data[index + 1] & 0b00000100) >> 2) * 2 - 1;
                    newOverlayBuildings.set(-(index / 3), {
                        xOffset:
                        (
                            (data[index] >> 3) * TILE_PX
                            + game.ui.buildingSchema[model].gridWidth * (TILE_PX / 2) * xSide
                        ) * xSide,
                        yOffset: (
                            (data[index + 1] >> 3) * TILE_PX
                            + game.ui.buildingSchema[model].gridHeight * (TILE_PX / 2) * ySide
                        ) * ySide,
                        yaw: (data[index] & 0b00000011) * 90,
                        tier: (data[index + 2] & 0b00000111) + 1,
                        model
                    });
                };

                overlay.reset();
                overlay.buildings = newOverlayBuildings;
                overlay.update();
            } catch(err) {
                console.error("Import failed: Error while unpacking.", err.message);
            };
        };

        input.click();
    };

    /* ==== UI CREATION ==== */

    const faLink = document.createElement("link");
    faLink.rel = "stylesheet";
    faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
    document.head.appendChild(faLink);

    const toolbarInventoryElem = document.getElementsByClassName("hud-toolbar-inventory")[0];

    if(!toolbarInventoryElem) {
        console.error("It appears this website does not support Zombsmatica's toolbar UI. Please report this to the developer if this is not expected behavior.");
        return;
    };

    const zombsmaticaItemElem = document.createElement("a");

    zombsmaticaItemElem.classList.add("hud-toolbar-item");
    zombsmaticaItemElem.dataset.item = "Zombsmatica";

    toolbarInventoryElem.appendChild(zombsmaticaItemElem);

    const zombsmaticaMenuElem = document.createElement("section");

    zombsmaticaMenuElem.classList.add("zombsmatica-menu");

    zombsmaticaMenuElem.innerHTML = `
    <header>
        <nav>
            <a href="javascript:void(0)" class="zombsmatica-section-link active" data-section="Actions">Actions</a>
            <a href="javascript:void(0)" class="zombsmatica-section-link" data-section="Settings">Settings</a>
            <a href="javascript:void(0)" class="zombsmatica-section-link" data-section="About">About</a>
        </nav>
    </header>
    <section class="zombsmatica-section active" data-section="Actions">
        <ul class="zombsmatica-actions-list">
            <li>
                <button class="zombsmatica-action" data-action="OpenSandbox">
                    <i class="fa-solid fa-screwdriver-wrench"></i>
                    <em>Open Sandbox</em>
                </button>
            </li>
            <li>
                <button class="zombsmatica-action" data-action="Export">
                    <i class="fa-solid fa-download"></i>
                    <em>Export</em>
                </button>
            </li>
            <li>
                <button class="zombsmatica-action" data-action="Import">
                    <i class="fa-solid fa-file-import"></i>
                    <em>Import</em>
                </button>
            </li>
            <li>
                <button class="zombsmatica-action" data-action="Delete">
                    <i class="fa-solid fa-trash"></i>
                    <em>Delete</em>
                </button>
            </li>
        </ul>
    </section>
    <section class="zombsmatica-section" data-section="Settings">
        <em>This section is empty.</em>
    </section>
    <section class="zombsmatica-section" data-section="About">
        <p>
            <b>Zombsmatica</b> is a standalone, minimalistic script that allows you to build bases in a sandbox or in-game, export them as files, and import them as blueprints.
        </p>
    </section>
    `;

    document.body.appendChild(zombsmaticaMenuElem);

    /* ==== UI FUNCTIONALITY ==== */

    zombsmaticaItemElem.addEventListener("click", () => {
        if(overlay.isOpen) {
            overlay.disable();
        } else {
            overlay.enable();
        };

        zombsmaticaMenuElem.style.opacity = overlay.isOpen ? 1 : 0;

        setTimeout(() => {
            zombsmaticaMenuElem.style.pointerEvents = overlay.isOpen ? "all" : "none";
        }, overlay.isOpen ? 0 : 200);
    });

    let currentSection = "Actions";

    addEventListener("click", e => {
        if(e.target.classList.contains("zombsmatica-section-link")) {
            for(const elem of Array.from(document.querySelectorAll(`[data-section=${currentSection}]`))) {
                elem.classList.remove("active");
            };

            currentSection = e.target.dataset.section;

            for(const elem of Array.from(document.querySelectorAll(`[data-section=${currentSection}]`))) {
                elem.classList.add("active");
            };
        } else if(e.target.classList.contains("zombsmatica-action")) {
            switch(e.target.dataset.action) {
                case "OpenSandbox":
                    window.open("https://lbbzombs.github.io/zombs-server-spots/", "_blank");
                    break;
                case "Export":
                    exportBase();
                    break;
                case "Import":
                    importBase();
                    break;
                case "Delete":
                    overlay.reset();
                    break;
            };
        };
    });

    /* ==== STYLES ==== */

    const styles = `
    * {
        overscroll-behavior: none;
    }

    [data-item=Zombsmatica]::after {
        background-image: url('data:image/png;base64,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');
    }

    .zombsmatica-menu {
        position: absolute;
        top: 20px;
        left: 50vw;
        transform: translateX(-50%);

        resize: both;
        overflow: hidden;

        width: 435px;
        height: 100px;
        min-width: 435px;
        min-height: 100px;
        padding: 5px;

        display: flex;
        flex-direction: column;
        justify-content: space-between;

        background: rgba(0, 0, 0, 0.6);
        border-radius: 1px;
        outline: 12px double rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);

        opacity: 0;
        transition: opacity 200ms;

        font-family: monospace;
        color: rgba(255, 255, 255, 0.8);
        text-align: center;

        pointer-events: none;
    }

    .zombsmatica-menu *:not(i) {
        font-family: inherit;
        color: inherit;
        text-align: inherit;
    }

    .zombsmatica-menu > header > nav {
        width: 100%;

        display: flex;
        justify-content: space-evenly;
    }

    .zombsmatica-menu > header > nav > a {
        text-shadow: 0px 0px 2px black;
    }

    .zombsmatica-menu > header > nav > a.active {
        font-weight: bold;
    }

    .zombsmatica-menu > section {
        width: 100%;
        height: 100%;

        display: none;

        overflow: hidden;
    }

    .zombsmatica-menu > section.active {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .zombsmatica-menu > section button {
        cursor: pointer;
        transition: opacity 200ms, scale 200ms;

        outline: none;
    }

    .zombsmatica-menu > section button:hover {
        opacity: 0.9;
        scale: 1.04;
    }

    .zombsmatica-menu > section[data-section=Actions] > ul {
        width: 100%;
        margin: 0px;
        padding: 0px;

        display: flex;
        justify-content: space-around;
        gap: 5px;

        list-style: none;
    }

    .zombsmatica-menu > section[data-section=Actions] > ul > li {
        width: 100%;
        height: 64px;

        display: inline-block;

        background-color: rgba(0, 0, 0, 0.2);
        border-radius: 4px;
    }

    .zombsmatica-menu > section[data-section=Actions] > ul > li > button {
        width: 100%;
        height: 100%;

        display: flex;
        flex-direction: column;
        justify-content: space-evenly;
        align-items: center;

        background: transparent;
        border: none;
    }

    .zombsmatica-menu > section[data-section=Actions] > ul > li > button * {
        pointer-events: none;
    }

    .zombsmatica-menu > section[data-section=Actions] > ul > li > button > i {
        font-size: 32px;
    }

    .zombsmatica-menu > section[data-section=Actions] > ul > li > button > em {
        font-size: 12px;
    }
    `;

    const stylesElem = document.createElement("style");

    stylesElem.innerHTML = styles;

    document.body.appendChild(stylesElem);
})();