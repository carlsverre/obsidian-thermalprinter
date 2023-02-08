# Obsidian Thermal Printer

1. install the "lp" binary (cups-client on debian)
2. run the printer service
   ```shell
   cd print-server && go run main.go
   ```
3. open the preview pane using the printer icon in the ribbon
4. select some markdown in the editor
5. right click > "Thermal Printer Preview"
6. click print in the preview