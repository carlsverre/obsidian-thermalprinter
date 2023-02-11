import domtoimage from "dom-to-image";
import ipp from "ipp";
import {
	App,
	MarkdownPreviewView,
	MarkdownRenderChild,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

interface ThermalPrinterSettings {
	printWidth: number;
	printUrl: string;
}

const DEFAULT_SETTINGS: Partial<ThermalPrinterSettings> = {
	printWidth: 576,
	printUrl: "http://localhost:631/printers/M200",
};

export default class ThermalPrinter extends Plugin {
	settings: ThermalPrinterSettings;

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ThermalPrinterSettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				menu.addItem((item) => {
					item.setTitle("Thermal Printer: Preview selection")
						.setIcon("printer")
						.onClick(() => {
							new PrintPreviewModal(
								this.app,
								this.settings,
								editor.getSelection(),
								view.file
							).open();
						});
				});
			})
		);

		this.addCommand({
			id: "thermal-printer-preview",
			name: "Preview selection",
			editorCallback: (editor, view) => {
				new PrintPreviewModal(
					this.app,
					this.settings,
					editor.getSelection(),
					view.file
				).open();
			},
		});

		this.addCommand({
			id: "thermal-printer-preview-file",
			name: "Preview file",
			editorCallback: (editor, view) => {
				new PrintPreviewModal(
					this.app,
					this.settings,
					editor.getValue(),
					view.file
				).open();
			},
		});
	}

	onunload() {}
}

export class ThermalPrinterSettingsTab extends PluginSettingTab {
	plugin: ThermalPrinter;

	constructor(app: App, plugin: ThermalPrinter) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Thermal Printer Settings" });

		new Setting(containerEl)
			.setName("Print Width")
			.setDesc(
				"The width of the printed image in pixels, must be a multiple of 8."
			)
			.addText((text) =>
				text
					.setPlaceholder("576")
					.setValue(this.plugin.settings.printWidth.toString())
					.onChange(async (value) => {
						// error checking
						const num = parseInt(value, 10);
						if (isNaN(num) || num % 8 !== 0) {
							text.inputEl.style.border = "1px solid red";
							new Notice(
								"Print width must be a number and a multiple of 8"
							);
							return;
						}
						text.inputEl.style.border = "";

						this.plugin.settings.printWidth = num;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Printer Url")
			.setDesc("The url of the printer to print to.")
			.addText((text) =>
				text
					.setPlaceholder("http://localhost:631/printers/M200")
					.setValue(this.plugin.settings.printUrl)
					.onChange(async (value) => {
						this.plugin.settings.printUrl = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

class PrintPreviewModal extends Modal {
	settings: ThermalPrinterSettings;
	content: string;
	file: TFile | null;
	previewEl: HTMLElement;

	constructor(
		app: App,
		settings: ThermalPrinterSettings,
		content: string,
		file: TFile | null
	) {
		super(app);
		this.settings = settings;
		this.content = content;
		this.file = file;
	}

	onOpen() {
		const { contentEl, modalEl } = this;

		modalEl.style.width = "auto";
		modalEl.addEventListener("keydown", async (e) => {
			if (e.key === "Enter") {
				await this.onPrint();
				this.close();
			}
		});

		this.previewEl = contentEl.createEl("div");
		this.previewEl.className = "thermalprinter-preview theme-light";
		this.previewEl.style.width = this.settings.printWidth + "px";
		this.previewEl.style.padding = "8px";

		MarkdownPreviewView.renderMarkdown(
			this.content,
			this.previewEl,
			this.file?.path || "",
			new MarkdownRenderChild(this.previewEl)
		);

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText("Print (enter)")
				.setCta()
				.onClick(async () => {
					btn.setButtonText("Printing...");
					btn.setDisabled(true);
					await this.onPrint();
					this.close();
				});
		});

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText("Print with file name")
				.setCta()
				.onClick(async () => {
					this.previewEl.prepend(
						this.previewEl.createEl("h1", {
							text: this.file?.basename,
						})
					);

					btn.setButtonText("Printing...");
					btn.setDisabled(true);
					await this.onPrint();
					this.close();
				});
		});
	}

	async onPrint() {
		const buf = new EscBuffer();
		buf.writeInit();
		buf.writeStandardMode();
		buf.writeLineBreak();
		await buf.writeElement(this.previewEl, this.settings.printWidth);
		buf.writeLineBreak();

		// print using ipp
		const printer = new ipp.Printer(this.settings.printUrl);
		const msg: ipp.PrintJobRequest = {
			"operation-attributes-tag": {
				"requesting-user-name": "Thermal Printer",
				"job-name": "Thermal Printer",
				"document-format": "application/octet-stream",
			},
			data: buf.buffer,
		};
		printer.execute("Print-Job", msg, (err, res) => {
			if (err) {
				new Notice("Error printing: " + err);
				console.error(err, res);
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

const CODE_ESC = 0x1b;
const CODE_NEWLINE = "\n".charCodeAt(0);

class EscBuffer {
	buffer: Buffer;

	constructor() {
		this.buffer = Buffer.alloc(0);
	}

	write(data: Uint8Array | readonly number[]) {
		this.buffer = Buffer.concat([this.buffer, Buffer.from(data)]);
	}

	writeInit() {
		this.write([CODE_ESC, 0x40, CODE_NEWLINE]);
	}

	writeStandardMode() {
		this.write([CODE_ESC, 0x53, CODE_NEWLINE]);
	}

	writeLineBreak() {
		this.write([CODE_NEWLINE]);
	}

	async writeElement(element: HTMLElement, width: number) {
		const pixels = await domtoimage.toPixelData(element);
		const height = pixels.length / (width * 4);

		// if width is not a multiple of 8, fail
		if (width % 8 !== 0) {
			throw new Error("width must be a multiple of 8");
		}

		const imgBuffer: number[] = [];
		let cb = 0;
		let bindex = 0;

		for (let y = 0; y < height; ++y) {
			for (let x = 0; x < width; ++x) {
				const idxAtXYOffset = (y * width + x) * 4;
				// pixel is a Uint8Array[4] containing RGBA values of the pixel at (x, y) in the range 0..255
				const [r, g, b, a] = pixels.slice(
					idxAtXYOffset,
					idxAtXYOffset + 4
				);

				if (a > 126) {
					const grayscale = Math.floor(
						0.2126 * r + 0.7152 * g + 0.0722 * b
					);
					if (grayscale < 128) {
						cb |= 1 << (7 - bindex);
					}
				}

				++bindex;
				if (bindex === 8) {
					imgBuffer.push(cb);
					cb = 0;
					bindex = 0;
				}
			}
		}

		// Print raster bit image
		// reference:
		// https://reference.epson-biz.com/modules/ref_escpos/index.php?content_id=94

		// const xL = Math.floor((width % 2048) / 8);
		// const xH = Math.floor(width / 2048);
		// const yL = Math.floor(height % 256);
		// const yH = Math.floor(height / 256);

		const xL = (width >> 3) & 0xff;
		const xH = 0;
		const yL = height & 0xff;
		const yH = (height >> 8) & 0xff;

		this.write([0x1d, 0x76, 0x30, 48, xL, xH, yL, yH]);
		this.write(imgBuffer);
	}
}
