use base64::{engine::general_purpose::STANDARD, Engine};
use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, GenericImageView, ImageReader, Rgba};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeImageRequest {
    data: String,
    max_width: Option<u32>,
    max_height: Option<u32>,
    max_size_kb: Option<u32>,
    quality: Option<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResizeImageResponse {
    data: String,
    width: u32,
    height: u32,
    size_bytes: usize,
    quality: u8,
    format: String,
}

#[tauri::command]
pub fn resize_image(request: ResizeImageRequest) -> Result<ResizeImageResponse, String> {
    let input = STANDARD
        .decode(request.data.trim())
        .map_err(|error| format!("Invalid image data: {error}"))?;

    let reader = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .map_err(|error| format!("Could not read image: {error}"))?;

    let format = reader
        .format()
        .ok_or_else(|| "Unsupported or unknown image format".to_string())?;

    let image = reader
        .decode()
        .map_err(|error| format!("Could not decode image: {error}"))?;

    let resized = resize_to_fit(
        flatten_on_white(image),
        request.max_width,
        request.max_height,
    );

    let starting_quality = request.quality.unwrap_or(85).clamp(10, 100);
    let (output, quality) = if let Some(max_kb) = request.max_size_kb {
        compress_to_target_kb(&resized, max_kb, starting_quality)?
    } else {
        (encode_jpeg(&resized, starting_quality)?, starting_quality)
    };

    Ok(ResizeImageResponse {
        width: resized.width(),
        height: resized.height(),
        size_bytes: output.len(),
        quality,
        format: format!("{:?}", format).to_lowercase(),
        data: STANDARD.encode(output),
    })
}

fn flatten_on_white(image: DynamicImage) -> DynamicImage {
    if !image.color().has_alpha() {
        return image;
    }

    let rgba = image.to_rgba8();
    let (width, height) = rgba.dimensions();
    let mut flattened = image::RgbImage::new(width, height);

    for (x, y, Rgba([red, green, blue, alpha])) in rgba.enumerate_pixels() {
        let alpha_factor = *alpha as f32 / 255.0;
        let background = 255.0;
        let blend = |channel: u8| {
            ((channel as f32 * alpha_factor) + (background * (1.0 - alpha_factor))) as u8
        };

        flattened.put_pixel(x, y, image::Rgb([blend(*red), blend(*green), blend(*blue)]));
    }

    DynamicImage::ImageRgb8(flattened)
}

fn resize_to_fit(
    image: DynamicImage,
    max_width: Option<u32>,
    max_height: Option<u32>,
) -> DynamicImage {
    let (width, height) = image.dimensions();

    let target = match (max_width, max_height) {
        (None, None) => return image,
        (Some(max_width), None) if width <= max_width => return image,
        (None, Some(max_height)) if height <= max_height => return image,
        (Some(max_width), Some(max_height)) if width <= max_width && height <= max_height => {
            return image;
        }
        (Some(max_width), None) => {
            let ratio = max_width as f64 / width as f64;
            (max_width, (height as f64 * ratio).round().max(1.0) as u32)
        }
        (None, Some(max_height)) => {
            let ratio = max_height as f64 / height as f64;
            ((width as f64 * ratio).round().max(1.0) as u32, max_height)
        }
        (Some(max_width), Some(max_height)) => {
            let ratio = (max_width as f64 / width as f64).min(max_height as f64 / height as f64);
            if ratio >= 1.0 {
                return image;
            }

            (
                (width as f64 * ratio).round().max(1.0) as u32,
                (height as f64 * ratio).round().max(1.0) as u32,
            )
        }
    };

    image.resize_exact(target.0, target.1, image::imageops::FilterType::Lanczos3)
}

fn encode_jpeg(image: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let rgb = image.to_rgb8();
    let mut buffer = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut buffer, quality);

    encoder
        .encode(
            rgb.as_raw(),
            rgb.width(),
            rgb.height(),
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|error| format!("Could not encode JPEG: {error}"))?;

    Ok(buffer)
}

fn compress_to_target_kb(
    image: &DynamicImage,
    max_kb: u32,
    starting_quality: u8,
) -> Result<(Vec<u8>, u8), String> {
    let max_bytes = max_kb as usize * 1024;
    let mut quality = starting_quality;

    loop {
        let output = encode_jpeg(image, quality)?;
        if output.len() <= max_bytes || quality <= 10 {
            return Ok((output, quality));
        }

        quality = quality.saturating_sub(5);
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertPngToJpgRequest {
    data: String,
    quality: Option<u8>,
    max_size_kb: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertPngToJpgResponse {
    data: String,
    width: u32,
    height: u32,
    size_bytes: usize,
    quality: u8,
}

#[tauri::command]
pub fn convert_png_to_jpg(
    request: ConvertPngToJpgRequest,
) -> Result<ConvertPngToJpgResponse, String> {
    let input = STANDARD
        .decode(request.data.trim())
        .map_err(|error| format!("Invalid image data: {error}"))?;

    let reader = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .map_err(|error| format!("Could not read image: {error}"))?;

    let format = reader
        .format()
        .ok_or_else(|| "Unsupported or unknown image format".to_string())?;

    if format != image::ImageFormat::Png {
        return Err("Please choose a PNG image.".to_string());
    }

    let image = reader
        .decode()
        .map_err(|error| format!("Could not decode image: {error}"))?;

    let flattened = flatten_on_white(image);
    let starting_quality = request.quality.unwrap_or(90).clamp(10, 100);
    let (output, quality) = if let Some(max_kb) = request.max_size_kb {
        compress_to_target_kb(&flattened, max_kb, starting_quality)?
    } else {
        (encode_jpeg(&flattened, starting_quality)?, starting_quality)
    };

    Ok(ConvertPngToJpgResponse {
        width: flattened.width(),
        height: flattened.height(),
        size_bytes: output.len(),
        quality,
        data: STANDARD.encode(output),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgb};

    #[test]
    fn resize_and_compress_produces_jpeg_under_limit() {
        let mut buffer = Vec::new();
        let image = ImageBuffer::from_fn(800, 600, |x, y| {
            Rgb([(x % 255) as u8, (y % 255) as u8, ((x + y) % 255) as u8])
        });

        image
            .write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
            .unwrap();

        let response = resize_image(ResizeImageRequest {
            data: STANDARD.encode(buffer),
            max_width: Some(400),
            max_height: Some(400),
            max_size_kb: Some(50),
            quality: Some(85),
        })
        .expect("resize should succeed");

        assert!(response.width <= 400);
        assert!(response.height <= 400);
        assert!(response.size_bytes <= 50 * 1024);
    }

    #[test]
    fn convert_png_to_jpg_produces_jpeg() {
        let mut buffer = Vec::new();
        let image = ImageBuffer::from_fn(200, 150, |x, y| {
            Rgb([(x % 255) as u8, (y % 255) as u8, ((x + y) % 255) as u8])
        });

        image
            .write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Png)
            .unwrap();

        let response = convert_png_to_jpg(ConvertPngToJpgRequest {
            data: STANDARD.encode(buffer),
            quality: Some(85),
            max_size_kb: None,
        })
        .expect("conversion should succeed");

        assert_eq!(response.width, 200);
        assert_eq!(response.height, 150);
        assert!(response.size_bytes > 0);
        assert_eq!(response.quality, 85);
    }
}
