let presets = require("./presets.json");

class GUI {

    Init(rd, container) {

        if(!guify) {
            console.log("Guify was not found! Include it on the page to show the GUI for this program.");
            return
        }

        this.panel = new guify({
            title: 'Reaction-Diffusion Simulator',
            theme: 'dark',
            root: container,
            barMode: 'above',
            align: 'right',
            opacity: 0.95,
        });

        this.panel.Register({
            type: 'title',
            label: 'Parameters'
        });

        this.panel.Register({
            type: "select",
            label: "Preset",
            options: Object.getOwnPropertyNames(presets).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
            initial: rd.rdView.selectedPreset,
            onChange: (name) => {
                rd.rdView.SetPreset(name);
                //rd.rdView.Reset();
            }
        });

        this.panel.Register({
            type: "range", label: "Feed Rate",
            min: 0.001, max: 0.1, step: 0.001,
            object: rd.rdView.computeUniforms.feed,
            property: "value"
        });

        this.panel.Register({
            type: "range", label: "Kill Rate",
            min: 0.001, max: 0.1, step: 0.001,
            object: rd.rdView.computeUniforms.kill,
            property: "value"
        });

        this.panel.Register({
            type: "range", label: "D_a",
            min: 0.001, max: 1.0, step: 0.001,
            object: rd.rdView.computeUniforms.da,
            property: "value"
        });

        this.panel.Register({
            type: "range", label: "D_b",
            min: 0.001, max: 1.0, step: 0.001,
            object: rd.rdView.computeUniforms.db,
            property: "value"
        });

        this.panel.Register({
            type: "range", label: "Time Scale",
            min: 0, max: 1,
            object: rd.rdView.computeUniforms.timestep,
            property: "value"
        });

        this.panel.Register({
            type: 'title',
            label: 'Interaction'
        });

        this.panel.Register({
            type: "range", label: "Brush Radius",
            min: 0.5, max: 100, step: 0.5,
            object: rd.rdView.computeUniforms.dropperSize,
            property: "value"
        });


        this.panel.Register({
            type: 'select',
            label: 'Reseed Method',
            object: rd.rdView,
            property: 'seedType',
            options: ['Circle', 'Noise']
        })

        this.panel.Register({
            type: "button",
            label: "Reseed",
            action: () => rd.rdView.Reset()
        });

        this.panel.Register({
            type: "button",
            label: "Clear",
            action: () => rd.rdView.Clear()
        });


        this.panel.Register({
            type: "folder",
            label: "Advanced"
        })

        this.panel.Register({
            type: "range", label: "Res. Scale",
            folder: "Advanced",
            min: 0.1, max: 3.0,
            object: rd.rdView,
            property: "internalResolutionMultiplier",
            onChange: () => {
                rd.rdView.ReformRenderTargets(container.offsetWidth, container.offsetHeight);
            }
        });

        this.panel.Register({
            type: "range", label: "Steps Per Frame",
            folder: "Advanced",
            min: 0, max: 50, step: 1,
            object: rd.rdView,
            property: "computeStepsPerFrame"
        });

        this.panel.Register({
            type: "button", label: "Toggle FPS",
            folder: "Advanced",
            action: () => rd.ToggleDebug()
        })

    }

}

// Export "singleton" instance
export let gui = new GUI();