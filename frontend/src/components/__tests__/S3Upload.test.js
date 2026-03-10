import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import S3Upload from '../S3Upload';
import axiosInstance from '../../api/axiosInstance';
import axios from 'axios';

// ── Mock axiosInstance (our custom instance) ─────────────────────
jest.mock('../../api/axiosInstance', () => ({
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
}));

// ── Mock axios (used directly for the S3 PUT) ────────────────────
jest.mock('axios', () => ({
    create: jest.fn(() => ({
        interceptors: {
            request: { use: jest.fn(), eject: jest.fn() },
            response: { use: jest.fn(), eject: jest.fn() },
        },
    })),
    put: jest.fn(),
    get: jest.fn(),
    post: jest.fn(),
}));

// ────────────────────────────────────────────────────────────────
describe('S3Upload component', () => {
    const mockFile = new File(['hello world'], 'test.txt', { type: 'text/plain' });

    beforeEach(() => jest.clearAllMocks());

    // ── helpers ─────────────────────────────────────────────────
    const getFileInput = () => screen.getByTestId('file-input');
    const getUploadBtn = () => screen.getByRole('button', { name: /upload to s3/i });
    const selectFile = () => fireEvent.change(getFileInput(), { target: { files: [mockFile] } });

    // ── Test 1: Successful upload ─────────────────────────────
    test('shows "Upload successful!" after a successful upload + download link', async () => {
        axiosInstance.post.mockResolvedValue({
            data: { upload_url: 'https://mock-s3.com/put', key: 'uploads/123/test.txt' },
        });
        axios.put.mockResolvedValue({ status: 200 });
        axiosInstance.get.mockResolvedValue({
            data: { download_url: 'https://mock-s3.com/get' },
        });

        render(<S3Upload />);

        selectFile();
        fireEvent.click(getUploadBtn());

        await waitFor(() =>
            expect(screen.getByText(/upload successful/i)).toBeInTheDocument()
        );
        expect(screen.getByRole('link', { name: /download uploaded file/i })).toBeInTheDocument();
    });

    // ── Test 2: Failed upload ─────────────────────────────────
    test('shows "Upload failed:" when the pre-signed URL request fails', async () => {
        axiosInstance.post.mockRejectedValue({
            response: { data: { error: 'S3 bucket not configured' } },
        });

        render(<S3Upload />);

        selectFile();
        fireEvent.click(getUploadBtn());

        await waitFor(() =>
            expect(screen.getByText(/upload failed/i)).toBeInTheDocument()
        );
    });

    // ── Test 3: Button is disabled before file selection ──────
    test('Upload button is disabled when no file is selected', () => {
        render(<S3Upload />);
        expect(getUploadBtn()).toBeDisabled();
    });

    // ── Test 4: File label renders ────────────────────────────
    test('renders file label and input', () => {
        render(<S3Upload />);
        expect(screen.getByText(/choose file/i)).toBeInTheDocument();
        expect(getFileInput()).toBeInTheDocument();
    });
});
