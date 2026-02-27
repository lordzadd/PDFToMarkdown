import argparse
import logging
import os
from pdf_converter import PDFConverter


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert PDF files to Markdown format")
    parser.add_argument("pdf_path", help="Path to the PDF file or directory containing PDFs")
    parser.add_argument("--output", "-o", help="Output markdown file (single mode) or directory (batch mode)")
    parser.add_argument("--batch", "-b", action="store_true", help="Process all PDFs in the input directory")
    args = parser.parse_args()

    try:
        converter = PDFConverter()

        if args.batch:
            if not os.path.isdir(args.pdf_path):
                raise ValueError("For batch processing, pdf_path must be a directory")

            output_dir = args.output or os.path.join(os.getcwd(), "output")
            os.makedirs(output_dir, exist_ok=True)

            for file_name in sorted(os.listdir(args.pdf_path)):
                if not file_name.lower().endswith(".pdf"):
                    continue

                pdf_file = os.path.join(args.pdf_path, file_name)
                output_name = os.path.splitext(file_name)[0] + ".md"
                output_path = os.path.join(output_dir, output_name)
                converter.process_pdf(pdf_file, output_path)
            return 0

        if not os.path.isfile(args.pdf_path):
            raise ValueError("PDF file not found")

        if args.output:
            if os.path.isdir(args.output):
                output_name = os.path.splitext(os.path.basename(args.pdf_path))[0] + ".md"
                output_path = os.path.join(args.output, output_name)
            else:
                output_path = args.output
        else:
            output_path = os.path.splitext(args.pdf_path)[0] + ".md"

        converter.process_pdf(args.pdf_path, output_path)
        return 0

    except Exception as exc:
        logging.error("Error during conversion: %s", str(exc))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
