package main

import (
	"bytes"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"

	"github.com/BigJk/snd/thermalprinter/epson"
	"github.com/nfnt/resize"
)

func print(w http.ResponseWriter, req *http.Request) {
	img, _, err := image.Decode(req.Body)
	if err != nil {
		panic(err)
	}

	if img.Bounds().Dx() > 576 {
		img = resize.Resize(576, 0, img, resize.Lanczos3)
	}

	// good for images, bad for text
	// img = segment.Threshold(img, 128)

	// create a buffer to write to
	buf := new(bytes.Buffer)

	epson.InitPrinter(buf)
	epson.SetStandardMode(buf)
	epson.LineBreak(buf)
	epson.Image(buf, img)
	epson.LineBreak(buf)

	file, err := ioutil.TempFile("", "print_*.bin")
	if err != nil {
		panic(err)
	}

	defer func() {
		_ = os.Remove(file.Name())
	}()
	defer file.Close()

	if _, err := file.Write(buf.Bytes()); err != nil {
		panic(err)
	}

	file.Sync()
	file.Close()

	cmd := exec.Command("lp", "-d", "M200", "-o", "raw", file.Name())
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	err = cmd.Run()
	if err != nil {
		panic(err)
	}
}

func main() {
	http.HandleFunc("/print", print)
	http.ListenAndServe(":8090", nil)
}
