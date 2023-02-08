import domtoimage from "dom-to-image";
import {
	ItemView,
	MarkdownRenderChild,
	MarkdownRenderer,
	Plugin,
	request,
	WorkspaceLeaf,
} from "obsidian";

export const PRINT_PREVIEW_TYPE = "thermalprinter-preview";

export default class ThermalPrinter extends Plugin {
	async onload() {
		this.registerView(PRINT_PREVIEW_TYPE, (leaf) => new PrintPreview(leaf));

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				menu.addItem((item) => {
					item.setTitle("Thermal Printer Preview")
						.setIcon("printer")
						.onClick(async () => {
							this.app.workspace
								.getLeavesOfType(PRINT_PREVIEW_TYPE)
								.forEach((leaf) => {
									if (leaf.view instanceof PrintPreview) {
										leaf.view.setContent(
											editor.getSelection(),
											view.file?.parent.path || ""
										);
									}
								});
						});
				});
			})
		);

		await this.activateView();
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(PRINT_PREVIEW_TYPE);

		await this.app.workspace.getRightLeaf(false).setViewState({
			type: PRINT_PREVIEW_TYPE,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(PRINT_PREVIEW_TYPE)[0]
		);
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(PRINT_PREVIEW_TYPE);
	}
}

class PrintPreview extends ItemView {
	container: HTMLElement;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType() {
		return PRINT_PREVIEW_TYPE;
	}

	getDisplayText() {
		return "Thermal Printer Preview";
	}

	setContent(content: string, sourcePath: string) {
		this.container.empty();

		const markdownRenderChild = new MarkdownRenderChild(this.container);
		MarkdownRenderer.renderMarkdown(
			content,
			this.container,
			sourcePath,
			markdownRenderChild
		);
	}

	async onOpen() {
		const body = this.containerEl.children[1];
		body.empty();
		const buttons = body.createEl("div");

		const printButton = buttons.createEl("button", { text: "Print" });
		printButton.style.marginBottom = "8px";
		buttons.appendChild(printButton);

		const clearButton = buttons.createEl("button", { text: "Clear" });
		clearButton.style.marginBottom = "8px";
		clearButton.style.marginLeft = "8px";
		buttons.appendChild(clearButton);

		this.container = body.createEl("div");
		this.container.className = "thermalprinter-preview";
		this.container.style.width = "576px";
		this.container.style.padding = "8px";

		// when the button is clicked, take a screenshot of the container element
		printButton.addEventListener("click", async () => {
			const data = await domtoimage.toBlob(this.container);
			await request({
				url: "http://localhost:8090/print",
				method: "POST",
				body: await data.arrayBuffer(),
				headers: {
					"Content-Type": "application/octet-stream",
				},
			});
		});

		// when the button is clicked, clear the container element
		clearButton.addEventListener("click", () => {
			this.container.empty();
		});
	}

	async onClose() {}
}
