"use client";

import { useState, Fragment } from "react";
import { Dialog, Transition } from "@headlessui/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface AddImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImageAdded: () => void;
}

export default function AddImageModal({ isOpen, onClose, onImageAdded }: AddImageModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    disk_format: "qcow2",
    container_format: "bare",
    visibility: "private" as "private" | "public" | "shared" | "community",
    min_disk: 0,
    min_ram: 0,
    protected: false,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("Please select a file to upload");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // First, create the image metadata
      const createResponse = await fetch("/api/images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error || "Failed to create image");
      }

      const createdImage = await createResponse.json();

      // Then, upload the image data
      const uploadResponse = await fetch(`/api/images/${createdImage.id}`, {
        method: "PUT",
        body: selectedFile,
      });

      if (!uploadResponse.ok) {
        // If upload fails, try to delete the created image
        try {
          await fetch(`/api/images/${createdImage.id}`, { method: "DELETE" });
        } catch (deleteError) {
          console.error("Failed to cleanup image after upload failure:", deleteError);
        }
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || "Failed to upload image data");
      }

      // Success - refresh the images list and close modal
      onImageAdded();
      onClose();

      // Reset form
      setFormData({
        name: "",
        disk_format: "qcow2",
        container_format: "bare",
        visibility: "private",
        min_disk: 0,
        min_ram: 0,
        protected: false,
      });
      setSelectedFile(null);
    } catch (err) {
      console.error("Error creating/uploading image:", err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
      // Reset form when closing
      setFormData({
        name: "",
        disk_format: "qcow2",
        container_format: "bare",
        visibility: "private",
        min_disk: 0,
        min_ram: 0,
        protected: false,
      });
      setSelectedFile(null);
      setError(null);
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Add New Image
                  </Dialog.Title>
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                    onClick={handleClose}
                    disabled={isSubmitting}
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {error && (
                  <div className="rounded-md bg-red-50 p-4 mb-4">
                    <div className="text-sm text-red-700">{error}</div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                      Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      id="name"
                      required
                      value={formData.name}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      placeholder="Enter image name"
                      disabled={isSubmitting}
                    />
                  </div>

                  <div>
                    <label htmlFor="disk_format" className="block text-sm font-medium text-gray-700">
                      Disk Format *
                    </label>
                    <select
                      name="disk_format"
                      id="disk_format"
                      value={formData.disk_format}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      disabled={isSubmitting}
                    >
                      <option value="qcow2">QCOW2</option>
                      <option value="raw">Raw</option>
                      <option value="vhd">VHD</option>
                      <option value="vhdx">VHDX</option>
                      <option value="vmdk">VMDK</option>
                      <option value="iso">ISO</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="container_format" className="block text-sm font-medium text-gray-700">
                      Container Format *
                    </label>
                    <select
                      name="container_format"
                      id="container_format"
                      value={formData.container_format}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      disabled={isSubmitting}
                    >
                      <option value="bare">Bare</option>
                      <option value="ovf">OVF</option>
                      <option value="aki">AKI</option>
                      <option value="ari">ARI</option>
                      <option value="ami">AMI</option>
                      <option value="ova">OVA</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="visibility" className="block text-sm font-medium text-gray-700">
                      Visibility
                    </label>
                    <select
                      name="visibility"
                      id="visibility"
                      value={formData.visibility}
                      onChange={handleInputChange}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      disabled={isSubmitting}
                    >
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                      <option value="shared">Shared</option>
                      <option value="community">Community</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="min_disk" className="block text-sm font-medium text-gray-700">
                        Min Disk (GB)
                      </label>
                      <input
                        type="number"
                        name="min_disk"
                        id="min_disk"
                        min="0"
                        value={formData.min_disk}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <label htmlFor="min_ram" className="block text-sm font-medium text-gray-700">
                        Min RAM (MB)
                      </label>
                      <input
                        type="number"
                        name="min_ram"
                        id="min_ram"
                        min="0"
                        value={formData.min_ram}
                        onChange={handleInputChange}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="protected" className="flex items-center">
                      <input
                        type="checkbox"
                        name="protected"
                        id="protected"
                        checked={formData.protected}
                        onChange={handleInputChange}
                        className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                        disabled={isSubmitting}
                      />
                      <span className="ml-2 text-sm text-gray-700">Protected</span>
                    </label>
                  </div>

                  <div>
                    <label htmlFor="file" className="block text-sm font-medium text-gray-700">
                      Image File *
                    </label>
                    <input
                      type="file"
                      name="file"
                      id="file"
                      required
                      onChange={handleFileChange}
                      className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                      disabled={isSubmitting}
                      accept=".qcow2,.raw,.vhd,.vhdx,.vmdk,.iso"
                    />
                    {selectedFile && (
                      <p className="mt-1 text-sm text-gray-500">
                        Selected: {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isSubmitting}
                      className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? "Uploading..." : "Add Image"}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}